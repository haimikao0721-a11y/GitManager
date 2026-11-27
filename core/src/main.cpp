#include <winsock2.h>
#include <ws2tcpip.h>

#include "config.hpp"
#include "git.hpp"
#include "platform.hpp"
#include "httplib.h"

#include <shlobj.h>
#include <shobjidl.h>
#include <shellapi.h>

#include <atomic>
#include <chrono>
#include <cwctype>
#include <iostream>
#include <stdexcept>
#include <thread>

namespace gs {

namespace {

Config g_config;
std::string g_configPath;
std::string g_dataDir;

std::string S(const json& params, const std::string& key, const std::string& fallback = {}) {
    if (!params.is_object() || !params.contains(key) || !params[key].is_string()) return fallback;
    return params[key].get<std::string>();
}

int I(const json& params, const std::string& key, int fallback = 0) {
    if (!params.is_object() || !params.contains(key) || !params[key].is_number_integer()) return fallback;
    return params[key].get<int>();
}

bool B(const json& params, const std::string& key, bool fallback = false) {
    if (!params.is_object() || !params.contains(key) || !params[key].is_boolean()) return fallback;
    return params[key].get<bool>();
}

std::vector<std::string> SA(const json& params, const std::string& key) {
    std::vector<std::string> out;
    if (!params.is_object() || !params.contains(key) || !params[key].is_array()) return out;
    for (const auto& item : params[key]) {
        if (item.is_string()) out.push_back(item.get<std::string>());
    }
    return out;
}

void Log(const std::string& message) {
    std::cerr << "[core] " << message << std::endl;
    try {
        fs::path dir = PathFromUtf8(g_dataDir) / L"logs";
        EnsureDirectory(dir);
        std::ofstream file(dir / L"core.log", std::ios::app);
        if (file) file << IsoNow() << "  " << message << "\n";
    } catch (...) {
    }
}

void SaveConfigOrThrow() {
    g_config.Normalize();
    if (!g_config.Save(g_configPath)) {
        throw std::runtime_error("保存配置失败：" + g_configPath);
    }
}

void EnsureRepo(const std::string& path) {
    if (path.empty()) throw std::runtime_error("仓库路径为空。");
    fs::path repo = PathFromUtf8(path);
    std::error_code ec;
    if (!fs::exists(repo, ec) || !fs::is_directory(repo, ec)) {
        throw std::runtime_error("仓库路径不存在：" + path);
    }
    if (!fs::exists(repo / L".git", ec)) {
        throw std::runtime_error("不是 Git 仓库：" + path);
    }
}

json RunChecked(const std::string& path, const std::vector<std::string>& args,
                bool allowPrompt = false, int timeoutMs = 180000) {
    auto result = RunGit(path, args, allowPrompt, timeoutMs);
    if (!result.ok) {
        std::string message = result.Text();
        if (message.empty()) message = "Git 命令失败（exit " + std::to_string(result.exitCode) + "）";
        if (IsIndexLockError(message)) {
            message = "仓库正被另一个 Git 进程占用（index.lock）。\n"
                      "请关闭 Cursor / PyCharm 等工具的 Git 操作，或稍后重试。\n\n" + message;
        }
        throw std::runtime_error(message);
    }
    return json{{"output", result.Text()}};
}

json RepoInfo(const std::string& path, bool includeStatus = true) {
    EnsureRepo(path);
    return RepoInfoJson(path, g_config, includeStatus);
}

json Dispatch(const std::string& method, const json& params) {
    // system / config -------------------------------------------------
    if (method == "system.info") {
        return json{
            {"version", "0.0.2"},
            {"configPath", g_configPath},
            {"dataDir", g_dataDir},
            {"platform", "windows"},
            {"arch", "x64"},
            {"cwd", PathToUtf8(fs::current_path())},
            {"home", HomeDir()},
            {"git", CheckGitVersion()},
        };
    }
    if (method == "system.git") return CheckGitVersion();

    if (method == "config.get") {
        return json{{"config", g_config.ToJson()}, {"path", g_configPath}, {"dataDir", g_dataDir}};
    }
    if (method == "config.save") {
        if (!params.contains("config") || !params["config"].is_object()) {
            throw std::runtime_error("缺少 config 参数。");
        }
        g_config = Config::FromJson(params["config"]);
        SaveConfigOrThrow();
        return json{{"config", g_config.ToJson()}};
    }

    if (method == "accounts.save") {
        if (!params.contains("account") || !params["account"].is_object()) {
            throw std::runtime_error("缺少 account 参数。");
        }
        Account account = Account::FromJson(params["account"]);
        bool makeDefault = B(params, "makeDefault", false);
        if (account.id.empty()) account.id = RandomId();
        if (account.name.empty()) {
            account.name = account.githubUser.empty() ? "未命名账号" : account.githubUser;
        }
        if (account.sshHost.empty()) account.sshHost = "github.com";
        if (makeDefault) {
            for (auto& item : g_config.accounts) item.isDefault = false;
            account.isDefault = true;
        }
        Account* existing = g_config.FindAccount(account.id);
        if (existing) {
            *existing = account;
        } else {
            if (g_config.accounts.empty()) account.isDefault = true;
            g_config.accounts.push_back(account);
        }
        SaveConfigOrThrow();
        return json{{"account", account.ToJson()}, {"config", g_config.ToJson()}};
    }
    if (method == "accounts.delete") {
        std::string id = S(params, "id");
        if (id.empty()) throw std::runtime_error("缺少账号 id。");
        auto& accounts = g_config.accounts;
        accounts.erase(std::remove_if(accounts.begin(), accounts.end(),
                                      [&](const Account& account) { return account.id == id; }),
                       accounts.end());
        g_config.Normalize();
        SaveConfigOrThrow();
        return json{{"config", g_config.ToJson()}};
    }
    if (method == "accounts.setDefault") {
        std::string id = S(params, "id");
        bool found = false;
        for (auto& account : g_config.accounts) {
            account.isDefault = account.id == id;
            found = found || account.isDefault;
        }
        if (!found) throw std::runtime_error("账号不存在：" + id);
        SaveConfigOrThrow();
        return json{{"config", g_config.ToJson()}};
    }

    // repository discovery / read ------------------------------------
    if (method == "repos.scan") {
        auto roots = SA(params, "roots");
        if (!roots.empty()) {
            g_config.scanRoots = roots;
            SaveConfigOrThrow();
        }
        return ScanRepos(g_config, roots);
    }
    if (method == "repo.info") {
        return RepoInfo(S(params, "path"), B(params, "includeStatus", true));
    }
    if (method == "repo.status") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        return RepoStatusJson(path);
    }
    if (method == "repo.branches") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        return RepoBranchesJson(path);
    }
    if (method == "repo.stashes") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        return RepoStashesJson(path);
    }
    if (method == "repo.history") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        int limit = I(params, "limit", g_config.settings.historyLimit);
        if (limit <= 0) limit = 2000;
        if (limit < 100) limit = 100;
        if (limit > 20000) limit = 20000;
        return RepoHistoryJson(path, S(params, "filter", "current"), limit);
    }
    if (method == "repo.remotes") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        return RepoRemotesJson(path);
    }

    // repository mutations -------------------------------------------
    if (method == "repo.switchAccount") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string accountId = S(params, "accountId");
        const Account* account = g_config.FindAccount(accountId);
        if (!account) {
            account = g_config.DefaultAccount();
            if (!account) throw std::runtime_error("没有可用账号，请先创建账号。");
        }
        json result = SwitchRepoAccount(path, *account, S(params, "protocol", ""));
        result["repo"] = RepoInfoJson(path, g_config, false);
        return result;
    }
    if (method == "repo.fetch") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        auto result = RunGit(path, {"fetch", "--all", "--prune"}, true, 300000);
        if (!result.ok) throw std::runtime_error(result.Text());
        return json{{"output", result.Text()}, {"repo", RepoInfoJson(path, g_config, false)}};
    }
    if (method == "repo.pull") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        auto result = RunGit(path, {"pull", "--ff-only"}, true, 300000);
        if (!result.ok) throw std::runtime_error(result.Text());
        return json{{"output", result.Text()}};
    }
    if (method == "repo.push") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string current = Trim(RunGit(path, {"branch", "--show-current"}, false, 15000).output);
        std::vector<std::string> args = {"push"};
        auto upstreamResult = RunGit(path, {"rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"},
                                      false, 15000);
        if (!upstreamResult.ok) {
            args.push_back("-u");
            args.push_back("origin");
            args.push_back(current);
        }
        auto result = RunGit(path, args, true, 300000);
        if (!result.ok) throw std::runtime_error(result.Text());
        return json{{"output", result.Text()}};
    }
    if (method == "repo.stage") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        auto paths = SA(params, "paths");
        std::vector<std::string> args = {"add", "-A"};
        if (!paths.empty()) {
            args.push_back("--");
            for (const auto& item : paths) args.push_back(item);
        }
        return RunChecked(path, args, false, 60000);
    }
    if (method == "repo.unstage") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        auto paths = SA(params, "paths");
        std::vector<std::string> args = {"reset", "--"};
        for (const auto& item : paths) args.push_back(item);
        if (paths.empty()) args = {"reset"};
        return RunChecked(path, args, false, 60000);
    }
    if (method == "repo.discard") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        if (!params.contains("files") || !params["files"].is_array()) {
            throw std::runtime_error("缺少 files 参数。");
        }
        json outputs = json::array();
        for (const auto& file : params["files"]) {
            if (!file.is_object()) continue;
            std::string relative = file.value("path", "");
            if (relative.empty()) continue;
            bool untracked = file.value("untracked", false);
            std::vector<std::string> args = untracked
                ? std::vector<std::string>{"clean", "-fd", "--", relative}
                : std::vector<std::string>{"restore", "--", relative};
            auto result = RunGit(path, args, false, 60000);
            outputs.push_back(json{{"path", relative}, {"ok", result.ok}, {"output", result.Text()}});
            if (!result.ok) {
                throw std::runtime_error("丢弃修改失败：" + relative + "\n" + result.Text());
            }
        }
        return json{{"results", outputs}};
    }
    if (method == "repo.commit") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string message = S(params, "message");
        if (Trim(message).empty()) throw std::runtime_error("提交说明不能为空。");
        std::vector<std::string> args = {"commit", "-m", message};
        if (B(params, "amend", false)) args.push_back("--amend");
        return RunChecked(path, args, true, 60000);
    }
    if (method == "repo.stash.push") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string message = S(params, "message", "Git管理器");
        std::vector<std::string> args = {"stash", "push", "-m", message};
        if (B(params, "includeUntracked", false)) args.push_back("--include-untracked");
        return RunChecked(path, args, false, 60000);
    }
    if (method == "repo.stash.apply" || method == "repo.stash.pop" || method == "repo.stash.drop") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        int index = I(params, "index", 0);
        std::string action = method.substr(std::string("repo.stash.").size());
        std::string ref = "stash@{" + std::to_string(index) + "}";
        return RunChecked(path, {"stash", action, ref}, false, 60000);
    }
    if (method == "repo.branch.create") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string name = Trim(S(params, "name"));
        if (name.empty()) throw std::runtime_error("分支名不能为空。");
        std::string base = Trim(S(params, "base"));
        bool switchTo = B(params, "switch", true);
        std::vector<std::string> args = switchTo ? std::vector<std::string>{"switch", "-c", name}
                                                 : std::vector<std::string>{"branch", name};
        if (!base.empty()) args.push_back(base);
        return RunChecked(path, args, false, 60000);
    }
    if (method == "repo.branch.switch") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string name = Trim(S(params, "name"));
        if (name.empty()) throw std::runtime_error("分支名不能为空。");
        auto localCheck = RunGit(path, {"show-ref", "--verify", "--quiet", "refs/heads/" + name}, false, 15000);
        if (localCheck.ok) {
            return RunChecked(path, {"switch", name}, false, 60000);
        }
        size_t slash = name.find('/');
        if (slash != std::string::npos) {
            std::string localName = name.substr(slash + 1);
            return RunChecked(path, {"switch", "-c", localName, "--track", name}, false, 60000);
        }
        return RunChecked(path, {"switch", name}, false, 60000);
    }
    if (method == "repo.branch.delete") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string name = Trim(S(params, "name"));
        if (name.empty()) throw std::runtime_error("分支名不能为空。");
        bool force = B(params, "force", false);
        return RunChecked(path, {"branch", force ? "-D" : "-d", name}, false, 60000);
    }
    if (method == "repo.checkout") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string target = Trim(S(params, "target"));
        if (target.empty()) throw std::runtime_error("缺少签出目标。");
        return RunChecked(path, {"checkout", target}, false, 60000);
    }
    if (method == "repo.conflict.resolve") {
        std::string path = S(params, "path");
        EnsureRepo(path);
        std::string file = S(params, "file");
        std::string side = S(params, "side", "ours");
        if (file.empty()) throw std::runtime_error("缺少文件路径。");
        if (side != "ours" && side != "theirs") throw std::runtime_error("side 只能是 ours 或 theirs。");
        auto checkout = RunGit(path, {"checkout", "--" + side, "--", file}, false, 60000);
        if (!checkout.ok) throw std::runtime_error(checkout.Text());
        return RunChecked(path, {"add", "--", file}, false, 60000);
    }
    if (method == "repo.init") {
        std::string path = S(params, "path");
        if (path.empty()) throw std::runtime_error("路径不能为空。");
        fs::path dir = PathFromUtf8(path);
        EnsureDirectory(dir);
        if (!fs::exists(dir / L".git")) {
            auto init = RunGit(path, {"init", "-b", "main"}, false, 60000);
            if (!init.ok) throw std::runtime_error(init.Text());
        }
        std::string remoteUrl = S(params, "remoteUrl");
        if (!remoteUrl.empty()) {
            auto existing = RunGit(path, {"remote", "get-url", "origin"}, false, 15000);
            if (existing.ok) {
                auto result = RunGit(path, {"remote", "set-url", "origin", remoteUrl}, false, 15000);
                if (!result.ok) throw std::runtime_error(result.Text());
            } else {
                auto result = RunGit(path, {"remote", "add", "origin", remoteUrl}, false, 15000);
                if (!result.ok) throw std::runtime_error(result.Text());
            }
        }
        return RepoInfoJson(path, g_config, true);
    }

    if (method == "system.clearBinding") {
        json results = json::array();
        fs::path backupDir = PathFromUtf8(g_dataDir) / L"backups";
        EnsureDirectory(backupDir);
        auto backupFile = [&](const fs::path& source, const std::string& name) {
            if (GetFileAttributesW(source.c_str()) == INVALID_FILE_ATTRIBUTES) return;
            fs::path target = backupDir / PathFromUtf8(name + "-" + TimestampForFile() + source.extension().string());
            CopyFileW(source.c_str(), target.c_str(), FALSE);
        };

        CredentialsClearGitHub();
        results.push_back("已清除 GitHub 相关 Windows 凭据");

        fs::path home = PathFromUtf8(HomeDir());
        fs::path gitCredentials = home / L".git-credentials";
        if (GetFileAttributesW(gitCredentials.c_str()) != INVALID_FILE_ATTRIBUTES) {
            backupFile(gitCredentials, "git-credentials");
            std::string content = ReadFileUtf8(gitCredentials);
            std::vector<std::string> kept;
            for (const auto& line : SplitLines(content)) {
                if (ToLower(line).find("github.com") == std::string::npos) kept.push_back(line);
            }
            std::string next = Join(kept, "\n");
            if (!next.empty()) next += "\n";
            WriteFileUtf8(gitCredentials, next);
            results.push_back("已清理 ~/.git-credentials 的 GitHub 行");
        } else {
            results.push_back("没有 ~/.git-credentials，跳过");
        }

        fs::path gitConfig = home / L".gitconfig";
        if (GetFileAttributesW(gitConfig.c_str()) != INVALID_FILE_ATTRIBUTES) {
            backupFile(gitConfig, "gitconfig");
        }
        RunGitGlobal({"config", "--global", "--unset-all", "user.name"}, 15000);
        RunGitGlobal({"config", "--global", "--unset-all", "user.email"}, 15000);
        results.push_back("已清除全局 user.name / user.email");

        GitProxyClear();
        results.push_back("已清除全局 Git 代理");

        return json{{"results", results}};
    }

    // proxy -----------------------------------------------------------
    if (method == "proxy.git.get") return GitProxyGet();
    if (method == "proxy.git.set") {
        GitProxySet(S(params, "url"));
        return GitProxyGet();
    }
    if (method == "proxy.git.clear") {
        GitProxyClear();
        return GitProxyGet();
    }
    if (method == "proxy.system.get") return SystemProxyGet();
    if (method == "proxy.system.set") {
        SystemProxySet(S(params, "server"));
        return SystemProxyGet();
    }
    if (method == "proxy.system.clear") {
        SystemProxyClear();
        return SystemProxyGet();
    }

    // credentials -----------------------------------------------------
    if (method == "credentials.list") return CredentialsList();
    if (method == "credentials.get") return CredentialGet(S(params, "target"));
    if (method == "credentials.delete") {
        CredentialDelete(S(params, "target"));
        return json{{"ok", true}};
    }
    if (method == "credentials.clearGithub") {
        CredentialsClearGitHub();
        return CredentialsList();
    }
    if (method == "credentials.store") {
        CredentialStore(S(params, "target"), S(params, "userName"), S(params, "secret"),
                        B(params, "localMachine", true));
        return json{{"ok", true}};
    }

    // SSH -------------------------------------------------------------
    if (method == "ssh.list") return SshList();
    if (method == "ssh.generate") {
        return SshGenerate(S(params, "keyPath"), S(params, "comment"), B(params, "overwrite", false));
    }
    if (method == "ssh.config.upsert") {
        return SshUpsertConfig(S(params, "host"), S(params, "hostName", "github.com"),
                               S(params, "user", "git"), S(params, "identityFile"));
    }
    if (method == "ssh.test") return SshTest(S(params, "host", "github.com"));

    // GitHub ----------------------------------------------------------
    if (method == "github.test") return GitHubTest(S(params, "token"));
    if (method == "github.listRepos") return GitHubListRepos(S(params, "token"));
    if (method == "github.createRepo") {
        return GitHubCreateRepo(S(params, "token"), S(params, "name"), B(params, "private", true),
                                S(params, "description"), B(params, "autoInit", false));
    }

    throw std::runtime_error("未知方法：" + method);
}

void WriteResponse(const json& response) {
    std::cout << JsonDump(response) << "\n";
    std::cout.flush();
}

int SelfTest() {
    int failures = 0;
    auto git = CheckGitVersion();
    std::cout << "GIT: " << git.dump() << "\n";
    if (!git.value("installed", false)) {
        std::cout << "FAIL git not found\n";
        ++failures;
    }
    if (g_config.accounts.empty()) {
        std::cout << "FAIL config has no accounts\n";
        ++failures;
    } else {
        std::cout << "PASS config accounts: " << g_config.accounts.size() << "\n";
    }
    if (g_config.scanRoots.empty()) {
        std::cout << "FAIL config has no scan roots\n";
        ++failures;
    } else {
        std::cout << "PASS config scan roots: " << g_config.scanRoots.size() << "\n";
    }
    json configJson = g_config.ToJson();
    Config roundtrip = Config::FromJson(configJson);
    if (roundtrip.accounts.size() != g_config.accounts.size()) {
        std::cout << "FAIL config roundtrip\n";
        ++failures;
    } else {
        std::cout << "PASS config roundtrip\n";
    }
    RemoteInfo info = ParseRemoteUrl("git@github.com:owner/repo.git");
    if (info.owner != "owner" || info.repo != "repo" || info.protocol != "ssh") {
        std::cout << "FAIL remote parse\n";
        ++failures;
    } else {
        std::cout << "PASS remote parse\n";
    }
    std::cout << (failures == 0 ? "SELFTEST PASSED" : "SELFTEST FAILED") << "\n";
    return failures == 0 ? 0 : 1;
}

// ------------------------------------------------------------
// Browser app mode (C++ HTTP server + Chrome/Edge --app window)
// ------------------------------------------------------------

long long NowMs() {
    return std::chrono::duration_cast<std::chrono::milliseconds>(
               std::chrono::steady_clock::now().time_since_epoch())
        .count();
}

json ParseBody(const httplib::Request& req) {
    if (req.body.empty()) return json::object();
    return json::parse(req.body);
}

void JsonReply(httplib::Response& res, const json& value, int status = 200) {
    res.status = status;
    res.set_content(JsonDump(value), "application/json; charset=utf-8");
}

std::string MimeType(const fs::path& path) {
    std::string ext = ToLower(PathToUtf8(path.extension()));
    if (ext == ".html" || ext == ".htm") return "text/html; charset=utf-8";
    if (ext == ".js" || ext == ".mjs") return "application/javascript; charset=utf-8";
    if (ext == ".css") return "text/css; charset=utf-8";
    if (ext == ".json") return "application/json; charset=utf-8";
    if (ext == ".svg") return "image/svg+xml";
    if (ext == ".png") return "image/png";
    if (ext == ".jpg" || ext == ".jpeg") return "image/jpeg";
    if (ext == ".gif") return "image/gif";
    if (ext == ".ico") return "image/x-icon";
    if (ext == ".woff") return "font/woff";
    if (ext == ".woff2") return "font/woff2";
    if (ext == ".ttf") return "font/ttf";
    if (ext == ".map") return "application/json";
    return "application/octet-stream";
}

void ServeStaticFile(const fs::path& root, const httplib::Request& req, httplib::Response& res) {
    std::string path = req.path;
    if (path.empty() || path == "/") path = "/index.html";
    if (path.find("..") != std::string::npos) {
        res.status = 403;
        res.set_content("Forbidden", "text/plain; charset=utf-8");
        return;
    }

    fs::path file = root / PathFromUtf8(path.substr(1));
    std::error_code ec;
    if (!fs::exists(file, ec) || !fs::is_regular_file(file, ec)) {
        if (path.find('.') == std::string::npos) {
            file = root / L"index.html";
        } else {
            res.status = 404;
            res.set_content("Not Found", "text/plain; charset=utf-8");
            return;
        }
    }

    std::ifstream stream(file, std::ios::binary);
    if (!stream) {
        res.status = 404;
        res.set_content("Not Found", "text/plain; charset=utf-8");
        return;
    }
    std::ostringstream buffer;
    buffer << stream.rdbuf();
    res.set_content(buffer.str(), MimeType(file));
    res.set_header("Cache-Control", "no-store");
}

std::string PickPath(bool folder) {
    HRESULT init = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED | COINIT_DISABLE_OLE1DDE);
    bool initialized = SUCCEEDED(init);

    std::string result;
    IFileOpenDialog* dialog = nullptr;
    HRESULT hr = CoCreateInstance(CLSID_FileOpenDialog, nullptr, CLSCTX_INPROC_SERVER,
                                  IID_IFileOpenDialog, reinterpret_cast<void**>(&dialog));
    if (SUCCEEDED(hr) && dialog) {
        DWORD options = 0;
        dialog->GetOptions(&options);
        options |= FOS_FORCEFILESYSTEM | FOS_PATHMUSTEXIST;
        options |= folder ? FOS_PICKFOLDERS : FOS_FILEMUSTEXIST;
        dialog->SetOptions(options);

        hr = dialog->Show(GetForegroundWindow());
        if (SUCCEEDED(hr)) {
            IShellItem* item = nullptr;
            if (SUCCEEDED(dialog->GetResult(&item)) && item) {
                PWSTR value = nullptr;
                if (SUCCEEDED(item->GetDisplayName(SIGDN_FILESYSPATH, &value)) && value) {
                    result = WideToUtf8(value);
                    CoTaskMemFree(value);
                }
                item->Release();
            }
        }
        dialog->Release();
    }

    if (initialized) CoUninitialize();
    return result;
}

bool ShellOpen(const std::string& target) {
    if (target.empty()) return false;
    HINSTANCE result = ShellExecuteW(nullptr, L"open", Utf8ToWide(target).c_str(),
                                     nullptr, nullptr, SW_SHOWNORMAL);
    return reinterpret_cast<INT_PTR>(result) > 32;
}

bool LaunchDetached(const std::wstring& exe, const std::vector<std::wstring>& args,
                    const std::wstring& cwd, bool hidden) {
    std::wstring command = BuildCommandLine(exe, args);
    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = hidden ? SW_HIDE : SW_SHOWNORMAL;
    PROCESS_INFORMATION pi{};
    DWORD flags = CREATE_UNICODE_ENVIRONMENT | (hidden ? CREATE_NO_WINDOW : 0);
    BOOL created = CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE, flags,
                                  nullptr, cwd.empty() ? nullptr : cwd.c_str(), &si, &pi);
    if (!created) return false;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
}

std::string FindBrowser() {
    std::string forced = GetEnvUtf8("GIT_SWITCHER_BROWSER");
    if (!forced.empty() && fs::exists(PathFromUtf8(forced))) return forced;

    std::vector<std::string> candidates;
    auto add = [&](const std::string& base, const std::string& suffix) {
        if (!base.empty()) candidates.push_back(base + "\\" + suffix);
    };
    add(GetEnvUtf8("PROGRAMFILES"), "Google\\Chrome\\Application\\chrome.exe");
    add(GetEnvUtf8("PROGRAMFILES(X86)"), "Google\\Chrome\\Application\\chrome.exe");
    add(GetEnvUtf8("LOCALAPPDATA"), "Google\\Chrome\\Application\\chrome.exe");
    add(GetEnvUtf8("PROGRAMFILES"), "Microsoft\\Edge\\Application\\msedge.exe");
    add(GetEnvUtf8("PROGRAMFILES(X86)"), "Microsoft\\Edge\\Application\\msedge.exe");

    for (const auto& candidate : candidates) {
        if (fs::exists(PathFromUtf8(candidate))) return candidate;
    }

    auto where = RunProcess(L"where.exe", {L"chrome.exe"}, L"", 10000);
    if (where.launched && where.exitCode == 0) {
        auto lines = SplitLines(where.output);
        if (!lines.empty()) return lines.front();
    }
    return {};
}

bool LaunchBrowser(int port, DWORD& processId, HANDLE& processHandle) {
    std::string browser = FindBrowser();
    std::string url = "http://127.0.0.1:" + std::to_string(port) + "/";
    if (browser.empty()) {
        Log("browser not found, opening default browser");
        ShellOpen(url);
        return false;
    }

    fs::path profile = PathFromUtf8(g_dataDir) / L"browser-profile";
    EnsureDirectory(profile);

    std::vector<std::wstring> args{
        L"--app=" + Utf8ToWide(url),
        L"--user-data-dir=" + profile.wstring(),
        L"--window-size=1460,940",
        L"--window-position=80,40",
        L"--no-first-run",
        L"--no-default-browser-check",
        L"--disable-background-mode",
        L"--disable-component-update",
        L"--disable-sync",
        L"--disable-extensions",
        L"--disable-default-apps",
        L"--disable-features=Translate,MediaRouter",
        L"--metrics-recording-only",
        L"--no-service-autorun",
        L"--hide-crash-restore-bubble",
    };

    std::wstring parameters;
    for (size_t i = 0; i < args.size(); ++i) {
        if (i) parameters.push_back(L' ');
        parameters += QuoteArg(args[i]);
    }

    std::wstring browserWide = Utf8ToWide(browser);
    SHELLEXECUTEINFOW execute{};
    execute.cbSize = sizeof(execute);
    execute.fMask = SEE_MASK_NOCLOSEPROCESS | SEE_MASK_FLAG_NO_UI;
    execute.lpVerb = L"open";
    execute.lpFile = browserWide.c_str();
    execute.lpParameters = parameters.c_str();
    execute.nShow = SW_SHOWNORMAL;
    if (!ShellExecuteExW(&execute)) {
        DWORD error = GetLastError();
        Log("browser launch failed, error=" + std::to_string(error));
        ShellOpen(url);
        return false;
    }

    processHandle = execute.hProcess;
    processId = processHandle ? GetProcessId(processHandle) : 0;
    Log("browser launched: " + browser + " pid=" + std::to_string(processId));
    return true;
}

BOOL CALLBACK CloseAppWindowProc(HWND hwnd, LPARAM) {
    if (!IsWindowVisible(hwnd)) return TRUE;
    wchar_t title[512] = {};
    GetWindowTextW(hwnd, title, 512);
    std::wstring text(title);
    if (text.find(L"Git管理器") != std::wstring::npos ||
        text.find(L"Git 账户切换器") != std::wstring::npos ||
        text.find(L"Git Account Switcher") != std::wstring::npos) {
        DWORD pid = 0;
        GetWindowThreadProcessId(hwnd, &pid);
        wchar_t processPath[MAX_PATH] = {};
        HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
        if (process) {
            DWORD size = MAX_PATH;
            QueryFullProcessImageNameW(process, 0, processPath, &size);
            CloseHandle(process);
            std::wstring executable(processPath);
            std::wstring lower = executable;
            std::transform(lower.begin(), lower.end(), lower.begin(), ::towlower);
            if (lower.find(L"chrome.exe") != std::wstring::npos ||
                lower.find(L"msedge.exe") != std::wstring::npos) {
                PostMessageW(hwnd, WM_CLOSE, 0, 0);
            }
        }
    }
    return TRUE;
}

BOOL CALLBACK TerminateAppWindowProc(HWND hwnd, LPARAM) {
    if (!IsWindowVisible(hwnd)) return TRUE;
    wchar_t title[512] = {};
    GetWindowTextW(hwnd, title, 512);
    std::wstring text(title);
    if (text.find(L"Git管理器") == std::wstring::npos &&
        text.find(L"Git 账户切换器") == std::wstring::npos &&
        text.find(L"Git Account Switcher") == std::wstring::npos) {
        return TRUE;
    }

    DWORD pid = 0;
    GetWindowThreadProcessId(hwnd, &pid);
    HANDLE process = OpenProcess(PROCESS_TERMINATE | PROCESS_QUERY_LIMITED_INFORMATION, FALSE, pid);
    if (!process) return TRUE;
    wchar_t processPath[MAX_PATH] = {};
    DWORD size = MAX_PATH;
    if (QueryFullProcessImageNameW(process, 0, processPath, &size)) {
        std::wstring lower(processPath);
        std::transform(lower.begin(), lower.end(), lower.begin(), ::towlower);
        if (lower.find(L"chrome.exe") != std::wstring::npos ||
            lower.find(L"msedge.exe") != std::wstring::npos) {
            TerminateProcess(process, 0);
        }
    }
    CloseHandle(process);
    return TRUE;
}

void CloseAppWindows() {
    EnumWindows(CloseAppWindowProc, 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(500));
    EnumWindows(TerminateAppWindowProc, 0);
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
}

int RunWebMode(const std::string& webRoot, int preferredPort, bool openBrowser) {
    fs::path root = PathFromUtf8(webRoot);
    if (!fs::exists(root)) {
        Log("web root not found: " + webRoot);
        return 2;
    }

    std::wstring mutexName = L"Local\\GitAccountSwitcherV2";
    std::string instance = GetEnvUtf8("GIT_SWITCHER_V2_INSTANCE");
    if (!instance.empty()) mutexName += L"_" + Utf8ToWide(instance);
    HANDLE mutex = CreateMutexW(nullptr, TRUE, mutexName.c_str());
    bool alreadyRunning = mutex && GetLastError() == ERROR_ALREADY_EXISTS;
    fs::path runtimePath = PathFromUtf8(g_dataDir) / L"runtime.json";

    if (alreadyRunning) {
        int port = 0;
        try {
            json runtime = json::parse(ReadFileUtf8(runtimePath));
            port = runtime.value("port", 0);
        } catch (...) {
        }
        Log("existing instance detected, runtime port=" + std::to_string(port));
        if (port > 0) {
            DWORD pid = 0;
            HANDLE handle = nullptr;
            LaunchBrowser(port, pid, handle);
            if (handle) CloseHandle(handle);
        }
        CloseHandle(mutex);
        return 0;
    }

    httplib::Server server;
    server.set_read_timeout(60, 0);
    server.set_write_timeout(60, 0);
    server.set_payload_max_length(20 * 1024 * 1024);
    server.set_keep_alive_max_count(100);

    auto lastHeartbeat = std::make_shared<std::atomic<long long>>(0);
    auto stopRequested = std::make_shared<std::atomic<bool>>(false);

    server.Post("/rpc", [&](const httplib::Request& req, httplib::Response& res) {
        json id = nullptr;
        try {
            json request = ParseBody(req);
            if (!request.is_object()) throw std::runtime_error("请求必须是 JSON 对象。");
            if (request.contains("id")) id = request["id"];
            std::string method = request.value("method", "");
            if (method.empty()) throw std::runtime_error("缺少 method。");
            json params = request.value("params", json::object());
            json result = Dispatch(method, params);
            JsonReply(res, json{{"id", id}, {"ok", true}, {"result", result}});
        } catch (const std::exception& error) {
            JsonReply(res, json{{"id", id}, {"ok", false},
                                {"error", json{{"code", "error"}, {"message", error.what()}}}});
        }
    });

    server.Post("/dialog/folder", [&](const httplib::Request&, httplib::Response& res) {
        JsonReply(res, json{{"path", PickPath(true)}});
    });
    server.Post("/dialog/file", [&](const httplib::Request&, httplib::Response& res) {
        JsonReply(res, json{{"path", PickPath(false)}});
    });
    server.Post("/app/openPath", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = ParseBody(req);
            JsonReply(res, json{{"ok", ShellOpen(body.value("target", ""))}});
        } catch (const std::exception& error) {
            JsonReply(res, json{{"ok", false}, {"error", error.what()}}, 400);
        }
    });
    server.Post("/app/openExternal", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = ParseBody(req);
            JsonReply(res, json{{"ok", ShellOpen(body.value("url", ""))}});
        } catch (const std::exception& error) {
            JsonReply(res, json{{"ok", false}, {"error", error.what()}}, 400);
        }
    });
    server.Post("/app/showInFolder", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = ParseBody(req);
            std::string target = body.value("target", "");
            bool ok = !target.empty() && LaunchDetached(L"explorer.exe",
                                                        {L"/select,", Utf8ToWide(target)},
                                                        L"", false);
            JsonReply(res, json{{"ok", ok}});
        } catch (const std::exception& error) {
            JsonReply(res, json{{"ok", false}, {"error", error.what()}}, 400);
        }
    });
    server.Post("/app/openTerminal", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = ParseBody(req);
            std::string target = body.value("target", g_dataDir);
            std::wstring cwd = Utf8ToWide(target);
            bool ok = LaunchDetached(L"wt.exe", {L"-d", cwd}, L"", false);
            if (!ok) {
                ok = LaunchDetached(L"cmd.exe", {L"/K", L"cd /d \"" + cwd + L"\""}, L"", false);
            }
            JsonReply(res, json{{"ok", ok}});
        } catch (const std::exception& error) {
            JsonReply(res, json{{"ok", false}, {"error", error.what()}}, 400);
        }
    });
    server.Post("/app/openEditor", [&](const httplib::Request& req, httplib::Response& res) {
        try {
            json body = ParseBody(req);
            std::string target = body.value("target", "");
            std::string editor = body.value("editor", "code");
            bool ok = LaunchDetached(L"cmd.exe",
                                     {L"/c", Utf8ToWide(editor), Utf8ToWide(target)},
                                     L"", true);
            JsonReply(res, json{{"ok", ok}});
        } catch (const std::exception& error) {
            JsonReply(res, json{{"ok", false}, {"error", error.what()}}, 400);
        }
    });
    server.Post("/app/heartbeat", [&](const httplib::Request&, httplib::Response& res) {
        lastHeartbeat->store(NowMs());
        JsonReply(res, json{{"ok", true}});
    });
    server.Post("/app/quit", [&](const httplib::Request&, httplib::Response& res) {
        stopRequested->store(true);
        JsonReply(res, json{{"ok", true}});
        std::thread([]() {
            std::this_thread::sleep_for(std::chrono::milliseconds(400));
            CloseAppWindows();
            std::this_thread::sleep_for(std::chrono::milliseconds(400));
            ExitProcess(0);
        }).detach();
    });

    server.Get("/api/version", [&](const httplib::Request&, httplib::Response& res) {
        JsonReply(res, json{{"version", "0.0.2"}});
    });
    server.Get("/.*", [&](const httplib::Request& req, httplib::Response& res) {
        ServeStaticFile(root, req, res);
    });

    int port = 0;
    for (int candidate = preferredPort; candidate < preferredPort + 30; ++candidate) {
        if (server.bind_to_port("127.0.0.1", candidate)) {
            port = candidate;
            break;
        }
    }
    if (port == 0) {
        Log("no free port for web app");
        if (mutex) CloseHandle(mutex);
        return 3;
    }

    try {
        WriteFileUtf8(runtimePath, json{{"port", port}, {"pid", GetCurrentProcessId()}}.dump());
    } catch (...) {
    }

    std::thread serverThread([&]() { server.listen_after_bind(); });
    std::this_thread::sleep_for(std::chrono::milliseconds(350));

    DWORD chromePid = 0;
    HANDLE chromeProcess = nullptr;
    if (openBrowser) {
        LaunchBrowser(port, chromePid, chromeProcess);
    }
    Log("web app listening on http://127.0.0.1:" + std::to_string(port));

    std::thread monitor([&]() {
        while (!stopRequested->load()) {
            std::this_thread::sleep_for(std::chrono::seconds(5));
            long long last = lastHeartbeat->load();
            if (last > 0 && NowMs() - last > 90000) {
                CloseAppWindows();
                ExitProcess(0);
            }
        }
    });

    serverThread.join();
    stopRequested->store(true);
    if (monitor.joinable()) monitor.join();

    if (chromeProcess) {
        TerminateProcess(chromeProcess, 0);
        WaitForSingleObject(chromeProcess, 3000);
        CloseHandle(chromeProcess);
    }
    CloseAppWindows();
    std::error_code ec;
    fs::remove(runtimePath, ec);
    if (mutex) {
        ReleaseMutex(mutex);
        CloseHandle(mutex);
    }
    Log("web app stopped");
    return 0;
}

}  // namespace

}  // namespace gs

int main(int argc, char** argv) {
    using namespace gs;

    bool serve = false;
    bool openBrowser = false;
    bool selfTest = false;
    int webPort = 17893;
    std::string webRoot;

    for (int i = 1; i < argc; ++i) {
        std::string arg = argv[i];
        if (arg == "--config" && i + 1 < argc) {
            g_configPath = argv[++i];
        } else if (arg == "--serve") {
            serve = true;
        } else if (arg == "--open") {
            openBrowser = true;
        } else if (arg == "--no-open") {
            openBrowser = false;
        } else if (arg == "--selftest") {
            selfTest = true;
        } else if (arg == "--web-root" && i + 1 < argc) {
            webRoot = argv[++i];
        } else if (arg == "--port" && i + 1 < argc) {
            try {
                webPort = std::stoi(argv[++i]);
            } catch (...) {
            }
        } else if (arg == "--version") {
            std::cout << "0.0.2\n";
            return 0;
        }
    }

    if (g_configPath.empty()) g_configPath = GetEnvUtf8("GIT_SWITCHER_V2_CONFIG");
    if (g_configPath.empty()) g_configPath = Config::DefaultConfigPath();
    g_dataDir = PathToUtf8(PathFromUtf8(g_configPath).parent_path());
    EnsureDirectory(PathFromUtf8(g_dataDir));
    EnsureDirectory(PathFromUtf8(g_dataDir) / L"logs");

    bool existed = fs::exists(PathFromUtf8(g_configPath));
    g_config = Config::Load(g_configPath);
    if (!existed) g_config.Save(g_configPath);
    Log("core started, config=" + g_configPath);

    if (selfTest) return SelfTest();

    if (serve) {
        if (webRoot.empty()) {
            wchar_t modulePath[MAX_PATH] = {};
            DWORD length = GetModuleFileNameW(nullptr, modulePath, MAX_PATH);
            fs::path exeDir = length > 0 ? fs::path(modulePath).parent_path() : fs::current_path();
            std::vector<fs::path> candidates{
                exeDir / L"web",
                exeDir / L".." / L"web",
                exeDir / L".." / L".." / L"app" / L"out" / L"renderer",
                fs::current_path() / L"app" / L"out" / L"renderer",
            };
            for (const auto& candidate : candidates) {
                if (fs::exists(candidate / L"index.html")) {
                    webRoot = PathToUtf8(candidate);
                    break;
                }
            }
            if (webRoot.empty()) webRoot = PathToUtf8(candidates.front());
        }
        return RunWebMode(webRoot, webPort, openBrowser);
    }

    std::ios::sync_with_stdio(false);
    std::string line;
    while (std::getline(std::cin, line)) {
        if (Trim(line).empty()) continue;
        json id = nullptr;
        try {
            json request = json::parse(line);
            if (!request.is_object()) throw std::runtime_error("请求必须是 JSON 对象。");
            if (request.contains("id")) id = request["id"];
            std::string method = request.value("method", "");
            if (method.empty()) throw std::runtime_error("缺少 method。");
            json params = request.value("params", json::object());
            json result = Dispatch(method, params);
            WriteResponse(json{{"id", id}, {"ok", true}, {"result", result}});
        } catch (const std::exception& error) {
            WriteResponse(json{
                {"id", id},
                {"ok", false},
                {"error", json{{"code", "error"}, {"message", error.what()}}},
            });
        }
    }
    return 0;
}
