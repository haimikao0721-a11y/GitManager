#include "platform.hpp"
#include "git.hpp"

#include <wincred.h>
#include <winhttp.h>

#include <cstdio>
#include <stdexcept>
#include <system_error>

// wininet.h and winhttp.h define conflicting types in MinGW, so declare the
// two refresh calls we need directly. The import still comes from wininet.lib.
extern "C" __declspec(dllimport) BOOL WINAPI InternetSetOptionW(
    HINTERNET hInternet, DWORD dwOption, LPVOID lpBuffer, DWORD dwBufferLength);

namespace gs {

namespace {

constexpr DWORD kInternetOptionRefresh = 37;
constexpr DWORD kInternetOptionSettingsChanged = 39;

std::string FileTimeToIso(const FILETIME& fileTime) {
    SYSTEMTIME st{};
    if (!FileTimeToSystemTime(&fileTime, &st)) return {};
    char buffer[40];
    std::snprintf(buffer, sizeof(buffer), "%04d-%02d-%02dT%02d:%02d:%02d",
                  st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
    return buffer;
}

std::string CredentialTypeName(DWORD type) {
    switch (type) {
        case CRED_TYPE_GENERIC: return "generic";
        case CRED_TYPE_DOMAIN_PASSWORD: return "domain-password";
        case CRED_TYPE_DOMAIN_CERTIFICATE: return "domain-certificate";
        case CRED_TYPE_DOMAIN_VISIBLE_PASSWORD: return "domain-visible-password";
        default: return "unknown";
    }
}

std::string PersistName(DWORD persist) {
    switch (persist) {
        case CRED_PERSIST_SESSION: return "session";
        case CRED_PERSIST_LOCAL_MACHINE: return "local-machine";
        case CRED_PERSIST_ENTERPRISE: return "enterprise";
        default: return "unknown";
    }
}

std::string DecodeCredentialBlob(const std::vector<unsigned char>& blob) {
    if (blob.empty()) return {};
    size_t offset = 0;
    bool utf16 = false;
    if (blob.size() >= 2 && blob[0] == 0xFF && blob[1] == 0xFE) {
        utf16 = true;
        offset = 2;
    } else if (blob.size() >= 2 && blob.size() % 2 == 0) {
        size_t zeros = 0;
        size_t samples = 0;
        for (size_t i = 1; i < blob.size(); i += 2, ++samples) {
            if (blob[i] == 0) ++zeros;
        }
        utf16 = samples > 0 && zeros * 2 >= samples;
    }

    if (utf16) {
        std::wstring wide;
        wide.reserve((blob.size() - offset) / 2);
        for (size_t i = offset; i + 1 < blob.size(); i += 2) {
            wchar_t c = static_cast<wchar_t>(blob[i] | (blob[i + 1] << 8));
            if (c == 0) break;
            wide.push_back(c);
        }
        return Trim(WideToUtf8(wide));
    }
    std::string text(reinterpret_cast<const char*>(blob.data() + offset), blob.size() - offset);
    size_t nul = text.find('\0');
    if (nul != std::string::npos) text.resize(nul);
    return Trim(text);
}

std::vector<unsigned char> EncodeCredentialBlob(const std::string& secret) {
    std::wstring wide = Utf8ToWide(secret);
    std::vector<unsigned char> blob;
    blob.reserve(wide.size() * 2);
    for (wchar_t c : wide) {
        blob.push_back(static_cast<unsigned char>(c & 0xFF));
        blob.push_back(static_cast<unsigned char>((c >> 8) & 0xFF));
    }
    return blob;
}

bool IsGitHubCredential(const std::wstring& target, const std::wstring& userName) {
    std::string t = ToLower(WideToUtf8(target));
    std::string u = ToLower(WideToUtf8(userName));
    return t.find("github") != std::string::npos || StartsWith(t, "git:") ||
           u.find("github") != std::string::npos;
}

std::wstring RegistryString(HKEY key, const wchar_t* name) {
    DWORD type = 0;
    DWORD size = 0;
    if (RegQueryValueExW(key, name, nullptr, &type, nullptr, &size) != ERROR_SUCCESS) return {};
    if (type != REG_SZ && type != REG_EXPAND_SZ) return {};
    std::wstring value(size / sizeof(wchar_t) + 1, L'\0');
    if (RegQueryValueExW(key, name, nullptr, &type,
                         reinterpret_cast<LPBYTE>(value.data()), &size) != ERROR_SUCCESS) {
        return {};
    }
    value.resize(wcslen(value.c_str()));
    return value;
}

DWORD RegistryDword(HKEY key, const wchar_t* name, DWORD fallback = 0) {
    DWORD type = 0;
    DWORD value = fallback;
    DWORD size = sizeof(value);
    if (RegQueryValueExW(key, name, nullptr, &type,
                         reinterpret_cast<LPBYTE>(&value), &size) != ERROR_SUCCESS ||
        type != REG_DWORD) {
        return fallback;
    }
    return value;
}

HKEY OpenInternetSettings(bool write) {
    HKEY key = nullptr;
    RegOpenKeyExW(HKEY_CURRENT_USER,
                  L"Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
                  0, write ? KEY_READ | KEY_WRITE : KEY_READ, &key);
    return key;
}

json ReadSystemProxy() {
    json result{
        {"enabled", false},
        {"server", ""},
        {"autoConfig", ""},
        {"rawEnabled", 0},
    };
    HKEY key = OpenInternetSettings(false);
    if (!key) return result;
    DWORD enabled = RegistryDword(key, L"ProxyEnable", 0);
    std::wstring server = RegistryString(key, L"ProxyServer");
    std::wstring autoConfig = RegistryString(key, L"AutoConfigURL");
    RegCloseKey(key);
    result["enabled"] = enabled != 0;
    result["server"] = WideToUtf8(server);
    result["autoConfig"] = WideToUtf8(autoConfig);
    result["rawEnabled"] = enabled;
    return result;
}

void RefreshInternetSettings() {
    InternetSetOptionW(nullptr, kInternetOptionSettingsChanged, nullptr, 0);
    InternetSetOptionW(nullptr, kInternetOptionRefresh, nullptr, 0);
}

void BackupSystemProxy(const std::string& action) {
    try {
        json data{
            {"action", action},
            {"timestamp", IsoNow()},
            {"proxy", ReadSystemProxy()},
        };
        fs::path dir = PathFromUtf8(Config::DataDir()) / L"backups";
        EnsureDirectory(dir);
        fs::path file = dir / PathFromUtf8("system-proxy-" + TimestampForFile() + ".json");
        WriteFileUtf8(file, data.dump(2) + "\n");
    } catch (...) {
    }
}

std::string ExpandHome(const std::string& path) {
    if (path.empty()) return path;
    if (path[0] == '~') {
        std::string home = HomeDir();
        if (path.size() == 1) return home;
        if (path[1] == '/' || path[1] == '\\') return home + path.substr(1);
    }
    return path;
}

std::string QuoteForConfig(const std::string& value) {
    if (value.find(' ') == std::string::npos) return value;
    return "\"" + value + "\"";
}

struct WinHttpHandle {
    HINTERNET handle = nullptr;
    ~WinHttpHandle() {
        if (handle) WinHttpCloseHandle(handle);
    }
    WinHttpHandle() = default;
    WinHttpHandle(const WinHttpHandle&) = delete;
    WinHttpHandle& operator=(const WinHttpHandle&) = delete;
};

struct HttpResponse {
    int status = 0;
    std::string body;
};

HttpResponse HttpRequest(const std::string& method, const std::string& url,
                         const std::string& token, const std::string& body) {
    std::wstring wideUrl = Utf8ToWide(url);
    URL_COMPONENTS components{};
    components.dwStructSize = sizeof(components);
    if (!WinHttpCrackUrl(wideUrl.c_str(), static_cast<DWORD>(wideUrl.size()), 0, &components)) {
        throw std::runtime_error("无法解析 GitHub API 地址。");
    }
    std::wstring host(components.lpszHostName ? components.lpszHostName : L"",
                      components.dwHostNameLength);
    std::wstring path(components.lpszUrlPath ? components.lpszUrlPath : L"",
                      components.dwUrlPathLength);
    if (components.lpszExtraInfo && components.dwExtraInfoLength) {
        path.append(components.lpszExtraInfo, components.dwExtraInfoLength);
    }

    WinHttpHandle session;
    session.handle = WinHttpOpen(L"GitAccountSwitcherV2/2.0",
                                 WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY,
                                 WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!session.handle) {
        throw std::runtime_error("初始化 WinHTTP 失败：" +
                                 std::system_category().message(static_cast<int>(GetLastError())));
    }
    WinHttpSetTimeouts(session.handle, 15000, 15000, 15000, 30000);

    WinHttpHandle connect;
    connect.handle = WinHttpConnect(session.handle, host.c_str(), components.nPort, 0);
    if (!connect.handle) throw std::runtime_error("连接 GitHub API 失败。");

    DWORD flags = components.nScheme == INTERNET_SCHEME_HTTPS ? WINHTTP_FLAG_SECURE : 0;
    WinHttpHandle request;
    request.handle = WinHttpOpenRequest(connect.handle, Utf8ToWide(method).c_str(),
                                        path.c_str(), nullptr, WINHTTP_NO_REFERER,
                                        WINHTTP_DEFAULT_ACCEPT_TYPES, flags);
    if (!request.handle) throw std::runtime_error("创建 GitHub API 请求失败。");

    std::wstring headers =
        L"User-Agent: GitAccountSwitcherV2/2.0\r\n"
        L"Accept: application/vnd.github+json\r\n"
        L"X-GitHub-Api-Version: 2022-11-28\r\n";
    if (!body.empty()) headers += L"Content-Type: application/json\r\n";
    if (!token.empty()) headers += L"Authorization: Bearer " + Utf8ToWide(token) + L"\r\n";

    BOOL sent = WinHttpSendRequest(
        request.handle, headers.c_str(), static_cast<DWORD>(-1),
        body.empty() ? nullptr : const_cast<char*>(body.data()),
        static_cast<DWORD>(body.size()), static_cast<DWORD>(body.size()), 0);
    if (!sent) {
        throw std::runtime_error("发送 GitHub API 请求失败：" +
                                 std::system_category().message(static_cast<int>(GetLastError())));
    }
    if (!WinHttpReceiveResponse(request.handle, nullptr)) {
        throw std::runtime_error("读取 GitHub API 响应失败：" +
                                 std::system_category().message(static_cast<int>(GetLastError())));
    }

    HttpResponse response;
    DWORD status = 0;
    DWORD statusSize = sizeof(status);
    DWORD headerIndex = 0;
    WinHttpQueryHeaders(request.handle,
                        WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                        WINHTTP_HEADER_NAME_BY_INDEX, &status, &statusSize, &headerIndex);
    response.status = static_cast<int>(status);

    DWORD available = 0;
    do {
        if (!WinHttpQueryDataAvailable(request.handle, &available)) break;
        if (available == 0) break;
        std::string buffer(available, '\0');
        DWORD read = 0;
        if (!WinHttpReadData(request.handle, buffer.data(), available, &read)) break;
        buffer.resize(read);
        response.body += buffer;
    } while (available > 0);

    return response;
}

json ParseGitHubResponse(const HttpResponse& response) {
    if (response.status < 200 || response.status >= 300) {
        std::string message = response.body;
        try {
            json failed = json::parse(response.body);
            if (failed.contains("message") && failed["message"].is_string()) {
                message = failed["message"].get<std::string>();
            }
        } catch (...) {
        }
        throw std::runtime_error("GitHub API 返回 " + std::to_string(response.status) + "：" + message);
    }
    if (response.body.empty()) return json::object();
    return json::parse(response.body);
}

json SimplifyRepo(const json& repo) {
    if (!repo.is_object()) return json::object();
    json owner;
    if (repo.contains("owner") && repo["owner"].is_object()) {
        owner = json{
            {"login", repo["owner"].value("login", "")},
            {"avatarUrl", repo["owner"].value("avatar_url", "")},
        };
    }
    return json{
        {"id", repo.value("id", 0LL)},
        {"name", repo.value("name", "")},
        {"fullName", repo.value("full_name", "")},
        {"private", repo.value("private", false)},
        {"description", repo.value("description", "")},
        {"cloneUrl", repo.value("clone_url", "")},
        {"sshUrl", repo.value("ssh_url", "")},
        {"defaultBranch", repo.value("default_branch", "")},
        {"updatedAt", repo.value("updated_at", "")},
        {"owner", owner},
    };
}

}  // namespace

json CredentialsList() {
    PCREDENTIALW* credentials = nullptr;
    DWORD count = 0;
    if (!CredEnumerateW(nullptr, 0, &count, &credentials)) {
        DWORD error = GetLastError();
        if (error == ERROR_NOT_FOUND) return json{{"credentials", json::array()}, {"count", 0}};
        throw std::runtime_error("枚举 Windows 凭据失败：" +
                                 std::system_category().message(static_cast<int>(error)));
    }

    json list = json::array();
    for (DWORD i = 0; i < count; ++i) {
        if (!credentials[i]) continue;
        const CREDENTIALW& cred = *credentials[i];
        std::wstring target = cred.TargetName ? cred.TargetName : L"";
        std::wstring userName = cred.UserName ? cred.UserName : L"";
        std::string targetUtf8 = WideToUtf8(target);
        std::string userUtf8 = WideToUtf8(userName);
        list.push_back(json{
            {"target", targetUtf8},
            {"userName", userUtf8},
            {"type", CredentialTypeName(cred.Type)},
            {"rawType", cred.Type},
            {"persisted", PersistName(cred.Persist)},
            {"comment", cred.Comment ? WideToUtf8(cred.Comment) : ""},
            {"lastWritten", FileTimeToIso(cred.LastWritten)},
            {"isGitHub", IsGitHubCredential(target, userName)},
        });
    }
    CredFree(credentials);

    std::sort(list.begin(), list.end(), [](const json& a, const json& b) {
        return ToLower(a.value("target", "")) < ToLower(b.value("target", ""));
    });
    return json{{"credentials", list}, {"count", list.size()}};
}

json CredentialGet(const std::string& target) {
    std::wstring targetWide = Utf8ToWide(target);
    PCREDENTIALW credential = nullptr;
    if (!CredReadW(targetWide.c_str(), CRED_TYPE_GENERIC, 0, &credential)) {
        DWORD error = GetLastError();
        throw std::runtime_error("读取凭据失败：" +
                                 std::system_category().message(static_cast<int>(error)));
    }
    std::vector<unsigned char> blob;
    if (credential->CredentialBlob && credential->CredentialBlobSize > 0) {
        blob.assign(credential->CredentialBlob,
                    credential->CredentialBlob + credential->CredentialBlobSize);
    }
    json result{
        {"target", target},
        {"userName", credential->UserName ? WideToUtf8(credential->UserName) : ""},
        {"type", CredentialTypeName(credential->Type)},
        {"persisted", PersistName(credential->Persist)},
        {"comment", credential->Comment ? WideToUtf8(credential->Comment) : ""},
        {"lastWritten", FileTimeToIso(credential->LastWritten)},
        {"secret", DecodeCredentialBlob(blob)},
    };
    CredFree(credential);
    return result;
}

void CredentialDelete(const std::string& target) {
    std::wstring targetWide = Utf8ToWide(target);
    DWORD type = CRED_TYPE_GENERIC;

    PCREDENTIALW* credentials = nullptr;
    DWORD count = 0;
    if (CredEnumerateW(nullptr, 0, &count, &credentials)) {
        for (DWORD i = 0; i < count; ++i) {
            if (credentials[i] && credentials[i]->TargetName &&
                _wcsicmp(credentials[i]->TargetName, targetWide.c_str()) == 0) {
                type = credentials[i]->Type;
                break;
            }
        }
        CredFree(credentials);
    }

    if (!CredDeleteW(targetWide.c_str(), type, 0)) {
        DWORD error = GetLastError();
        if (error != ERROR_NOT_FOUND) {
            throw std::runtime_error("删除凭据失败：" +
                                     std::system_category().message(static_cast<int>(error)));
        }
    }
}

void CredentialsClearGitHub() {
    PCREDENTIALW* credentials = nullptr;
    DWORD count = 0;
    if (!CredEnumerateW(nullptr, 0, &count, &credentials)) {
        if (GetLastError() == ERROR_NOT_FOUND) return;
        throw std::runtime_error("枚举 Windows 凭据失败。");
    }
    std::vector<std::pair<std::wstring, DWORD>> targets;
    for (DWORD i = 0; i < count; ++i) {
        if (!credentials[i]) continue;
        std::wstring target = credentials[i]->TargetName ? credentials[i]->TargetName : L"";
        std::wstring user = credentials[i]->UserName ? credentials[i]->UserName : L"";
        if (IsGitHubCredential(target, user)) targets.emplace_back(target, credentials[i]->Type);
    }
    CredFree(credentials);

    for (const auto& [target, type] : targets) {
        CredDeleteW(target.c_str(), type, 0);
    }
}

void CredentialStore(const std::string& target, const std::string& userName,
                     const std::string& secret, bool localMachine) {
    std::vector<unsigned char> blob = EncodeCredentialBlob(secret);
    std::wstring targetWide = Utf8ToWide(target);
    std::wstring userWide = Utf8ToWide(userName);
    CREDENTIALW credential{};
    credential.Type = CRED_TYPE_GENERIC;
    credential.TargetName = targetWide.data();
    credential.UserName = userWide.data();
    credential.CredentialBlobSize = static_cast<DWORD>(blob.size());
    credential.CredentialBlob = blob.empty() ? nullptr : blob.data();
    credential.Persist = localMachine ? CRED_PERSIST_LOCAL_MACHINE : CRED_PERSIST_SESSION;
    credential.Comment = const_cast<LPWSTR>(L"Managed by Git Account Switcher v2");
    if (!CredWriteW(&credential, 0)) {
        throw std::runtime_error("写入凭据失败：" +
                                 std::system_category().message(static_cast<int>(GetLastError())));
    }
}

json GitProxyGet() {
    auto get = [](const std::string& key) -> std::string {
        auto result = RunGitGlobal({"config", "--global", "--get", key}, 15000);
        return result.ok ? Trim(result.output) : "";
    };
    return json{
        {"http", get("http.proxy")},
        {"https", get("https.proxy")},
    };
}

void GitProxySet(const std::string& url) {
    if (Trim(url).empty()) {
        GitProxyClear();
        return;
    }
    auto http = RunGitGlobal({"config", "--global", "--replace-all", "http.proxy", url}, 15000);
    if (!http.ok) throw std::runtime_error("设置 Git http.proxy 失败：" + http.Text());
    auto https = RunGitGlobal({"config", "--global", "--replace-all", "https.proxy", url}, 15000);
    if (!https.ok) throw std::runtime_error("设置 Git https.proxy 失败：" + https.Text());
}

void GitProxyClear() {
    RunGitGlobal({"config", "--global", "--unset-all", "http.proxy"}, 15000);
    RunGitGlobal({"config", "--global", "--unset-all", "https.proxy"}, 15000);
}

json SystemProxyGet() { return ReadSystemProxy(); }

void SystemProxySet(const std::string& server) {
    if (Trim(server).empty()) {
        SystemProxyClear();
        return;
    }
    BackupSystemProxy("set");
    HKEY key = OpenInternetSettings(true);
    if (!key) throw std::runtime_error("打开 Windows 系统代理注册表失败。");
    DWORD enabled = 1;
    std::wstring serverWide = Utf8ToWide(server);
    LONG setEnabled = RegSetValueExW(key, L"ProxyEnable", 0, REG_DWORD,
                                     reinterpret_cast<const BYTE*>(&enabled), sizeof(enabled));
    LONG setServer = RegSetValueExW(key, L"ProxyServer", 0, REG_SZ,
                                    reinterpret_cast<const BYTE*>(serverWide.c_str()),
                                    static_cast<DWORD>((serverWide.size() + 1) * sizeof(wchar_t)));
    RegDeleteValueW(key, L"AutoConfigURL");
    RegCloseKey(key);
    RefreshInternetSettings();
    if (setEnabled != ERROR_SUCCESS || setServer != ERROR_SUCCESS) {
        throw std::runtime_error("写入 Windows 系统代理失败。");
    }
}

void SystemProxyClear() {
    BackupSystemProxy("clear");
    HKEY key = OpenInternetSettings(true);
    if (!key) throw std::runtime_error("打开 Windows 系统代理注册表失败。");
    DWORD enabled = 0;
    RegSetValueExW(key, L"ProxyEnable", 0, REG_DWORD,
                   reinterpret_cast<const BYTE*>(&enabled), sizeof(enabled));
    RegDeleteValueW(key, L"ProxyServer");
    RegDeleteValueW(key, L"AutoConfigURL");
    RegCloseKey(key);
    RefreshInternetSettings();
}

json SshList() {
    fs::path sshDir = PathFromUtf8(HomeDir()) / L".ssh";
    json result{
        {"sshDir", PathToUtf8(sshDir)},
        {"configPath", PathToUtf8(sshDir / L"config")},
        {"configText", ""},
        {"keys", json::array()},
        {"privateKeys", json::array()},
    };
    if (!fs::exists(sshDir)) return result;

    result["configText"] = ReadFileUtf8(sshDir / L"config");

    std::error_code ec;
    for (const auto& entry : fs::directory_iterator(sshDir, fs::directory_options::skip_permission_denied, ec)) {
        if (!entry.is_regular_file(ec) || ec) continue;
        std::string name = PathToUtf8(entry.path().filename());
        std::string lower = ToLower(name);
        if (EndsWith(lower, ".pub")) {
            std::string content = Trim(ReadFileUtf8(entry.path()));
            auto parts = SplitWhitespace(content);
            result["keys"].push_back(json{
                {"name", name},
                {"path", PathToUtf8(entry.path())},
                {"type", parts.size() > 0 ? parts[0] : ""},
                {"comment", parts.size() > 2 ? Join(std::vector<std::string>(parts.begin() + 2, parts.end()), " ") : ""},
                {"publicKey", content},
            });
        } else if (lower != "config" && lower != "known_hosts" && lower != "known_hosts.old" &&
                   lower != "authorized_keys" && !StartsWith(lower, ".") &&
                   !EndsWith(lower, ".bak")) {
            result["privateKeys"].push_back(json{
                {"name", name},
                {"path", PathToUtf8(entry.path())},
            });
        }
    }
    return result;
}

json SshGenerate(const std::string& keyPath, const std::string& comment, bool overwrite) {
    std::string path = ExpandHome(keyPath);
    if (path.empty()) throw std::runtime_error("SSH Key 路径不能为空。");
    fs::path keyFile = PathFromUtf8(path);
    if (fs::exists(keyFile) && !overwrite) {
        throw std::runtime_error("SSH Key 已存在：" + path);
    }
    if (keyFile.has_parent_path()) EnsureDirectory(keyFile.parent_path());

    std::string publicPath = path + ".pub";
    if (fs::exists(publicPath)) fs::remove(PathFromUtf8(publicPath));
    if (overwrite && fs::exists(keyFile)) fs::remove(keyFile);

    std::vector<std::wstring> args{
        L"-t", L"ed25519",
        L"-C", Utf8ToWide(comment.empty() ? "GitAccountSwitcherV2" : comment),
        L"-f", Utf8ToWide(path),
        L"-N", L"",
    };
    auto result = RunProcess(L"ssh-keygen.exe", args, L"", 30000);
    if (!result.launched || result.exitCode != 0) {
        throw std::runtime_error("生成 SSH Key 失败：" + Trim(result.output) +
                                 (result.timedOut ? "（超时）" : ""));
    }
    std::string publicKey = Trim(ReadFileUtf8(PathFromUtf8(publicPath)));
    return json{
        {"privatePath", path},
        {"publicPath", publicPath},
        {"publicKey", publicKey},
    };
}

json SshUpsertConfig(const std::string& host, const std::string& hostName,
                     const std::string& user, const std::string& identityFile) {
    if (Trim(host).empty()) throw std::runtime_error("SSH Host 别名不能为空。");
    fs::path sshDir = PathFromUtf8(HomeDir()) / L".ssh";
    EnsureDirectory(sshDir);
    fs::path configPath = sshDir / L"config";

    std::string existing = ReadFileUtf8(configPath);
    std::string normalized = ReplaceAll(existing, "\r\n", "\n");
    std::vector<std::string> lines;
    {
        std::istringstream stream(normalized);
        std::string line;
        while (std::getline(stream, line)) lines.push_back(line);
    }

    std::vector<std::string> block;
    block.push_back("Host " + host);
    if (!hostName.empty()) block.push_back("    HostName " + hostName);
    if (!user.empty()) block.push_back("    User " + user);
    if (!identityFile.empty()) block.push_back("    IdentityFile " + QuoteForConfig(identityFile));
    block.push_back("    IdentitiesOnly yes");

    int start = -1;
    int end = static_cast<int>(lines.size());
    for (size_t i = 0; i < lines.size(); ++i) {
        std::string trimmed = Trim(lines[i]);
        std::string lower = ToLower(trimmed);
        if (StartsWith(lower, "host ")) {
            auto patterns = SplitWhitespace(trimmed.substr(5));
            bool matches = false;
            for (const auto& pattern : patterns) {
                if (IEquals(pattern, host)) {
                    matches = true;
                    break;
                }
            }
            if (matches) {
                start = static_cast<int>(i);
                for (size_t j = i + 1; j < lines.size(); ++j) {
                    if (StartsWith(ToLower(Trim(lines[j])), "host ")) {
                        end = static_cast<int>(j);
                        break;
                    }
                }
                break;
            }
        }
    }

    std::vector<std::string> output;
    if (start >= 0) {
        output.insert(output.end(), lines.begin(), lines.begin() + start);
        output.insert(output.end(), block.begin(), block.end());
        output.insert(output.end(), lines.begin() + end, lines.end());
    } else {
        output = lines;
        if (!output.empty() && !Trim(output.back()).empty()) output.push_back("");
        output.insert(output.end(), block.begin(), block.end());
    }

    if (fs::exists(configPath)) {
        fs::path backup = sshDir / PathFromUtf8("config.backup-" + TimestampForFile());
        std::error_code ec;
        fs::copy_file(configPath, backup, fs::copy_options::overwrite_existing, ec);
    }

    std::string content;
    for (const auto& line : output) content += line + "\r\n";
    if (!WriteFileUtf8(configPath, content)) throw std::runtime_error("写入 SSH 配置失败。");

    return json{
        {"path", PathToUtf8(configPath)},
        {"host", host},
        {"text", content},
    };
}

json SshTest(const std::string& host) {
    std::string targetHost = host.empty() ? "github.com" : host;
    std::vector<std::wstring> args{
        L"-o", L"BatchMode=yes",
        L"-o", L"StrictHostKeyChecking=accept-new",
        L"-o", L"ConnectTimeout=10",
        L"-T", L"git@" + Utf8ToWide(targetHost),
    };
    auto result = RunProcess(L"ssh.exe", args, L"", 30000);
    std::string output = Trim(result.output);
    std::string lower = ToLower(output);
    bool success = lower.find("successfully authenticated") != std::string::npos ||
                   (result.exitCode == 0 && lower.find("permission denied") == std::string::npos);
    return json{
        {"success", success},
        {"host", targetHost},
        {"exitCode", result.exitCode},
        {"timedOut", result.timedOut},
        {"output", output},
    };
}

json GitHubTest(const std::string& token) {
    if (Trim(token).empty()) throw std::runtime_error("GitHub Token 不能为空。");
    HttpResponse response = HttpRequest("GET", "https://api.github.com/user", Trim(token), "");
    json user = ParseGitHubResponse(response);
    return json{
        {"login", user.value("login", "")},
        {"name", user.value("name", "")},
        {"id", user.value("id", 0LL)},
        {"avatarUrl", user.value("avatar_url", "")},
        {"htmlUrl", user.value("html_url", "")},
        {"publicRepos", user.value("public_repos", 0)},
        {"totalPrivateRepos", user.value("total_private_repos", 0)},
    };
}

json GitHubListRepos(const std::string& token) {
    if (Trim(token).empty()) throw std::runtime_error("GitHub Token 不能为空。");
    HttpResponse response = HttpRequest(
        "GET",
        "https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",
        Trim(token), "");
    json repos = ParseGitHubResponse(response);
    json list = json::array();
    if (repos.is_array()) {
        for (const auto& repo : repos) list.push_back(SimplifyRepo(repo));
    }
    return json{{"repos", list}, {"count", list.size()}};
}

json GitHubCreateRepo(const std::string& token, const std::string& name, bool isPrivate,
                      const std::string& description, bool autoInit) {
    if (Trim(token).empty()) throw std::runtime_error("GitHub Token 不能为空。");
    if (Trim(name).empty()) throw std::runtime_error("仓库名不能为空。");
    json body{
        {"name", Trim(name)},
        {"private", isPrivate},
        {"description", description},
        {"auto_init", autoInit},
    };
    HttpResponse response = HttpRequest("POST", "https://api.github.com/user/repos",
                                        Trim(token), body.dump());
    json repo = ParseGitHubResponse(response);
    return SimplifyRepo(repo);
}

}  // namespace gs
