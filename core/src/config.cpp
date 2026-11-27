#include "config.hpp"

#include <ctime>
#include <iostream>

namespace gs {

namespace {

std::string GitGlobalValue(const std::string& key) {
    auto result = RunProcess(
        L"git.exe",
        {L"config", L"--global", L"--get", Utf8ToWide(key)},
        L"",
        10000);
    if (result.exitCode != 0) return {};
    return Trim(result.output);
}

std::string NormalizeAuthType(const std::string& value) {
    return IEquals(value, "ssh") ? "ssh" : "https";
}

std::string SafeString(const json& value, const std::string& key, const std::string& fallback = {}) {
    if (!value.is_object() || !value.contains(key) || !value[key].is_string()) return fallback;
    return value[key].get<std::string>();
}

bool SafeBool(const json& value, const std::string& key, bool fallback = false) {
    if (!value.is_object() || !value.contains(key) || !value[key].is_boolean()) return fallback;
    return value[key].get<bool>();
}

int SafeInt(const json& value, const std::string& key, int fallback = 0) {
    if (!value.is_object() || !value.contains(key) || !value[key].is_number_integer()) return fallback;
    return value[key].get<int>();
}

bool IsWritableDataDir(const fs::path& dir) {
    if (!EnsureDirectory(dir)) return false;
    fs::path probe = dir / L".write-test";
    bool ok = WriteFileUtf8(probe, "ok");
    if (ok) DeleteFileW(probe.c_str());
    return ok;
}

fs::path ExecutableDir() {
    wchar_t modulePath[MAX_PATH] = {};
    DWORD length = GetModuleFileNameW(nullptr, modulePath, MAX_PATH);
    if (length == 0) return fs::current_path();
    return fs::path(modulePath).parent_path();
}

std::string ResolveDataDir() {
    std::string overridePath = GetEnvUtf8("GIT_SWITCHER_V2_DATA");
    if (!overridePath.empty() && IsWritableDataDir(PathFromUtf8(overridePath))) {
        return overridePath;
    }

    std::vector<fs::path> candidates;
    std::string appData = GetEnvUtf8("APPDATA");
    if (!appData.empty()) candidates.push_back(PathFromUtf8(appData) / L"GitAccountSwitcherV2");
    std::string localAppData = GetEnvUtf8("LOCALAPPDATA");
    if (!localAppData.empty()) candidates.push_back(PathFromUtf8(localAppData) / L"GitAccountSwitcherV2");
    candidates.push_back(ExecutableDir() / L"data");
    std::string home = HomeDir();
    if (!home.empty()) candidates.push_back(PathFromUtf8(home) / L"GitAccountSwitcherV2");
    std::error_code ec;
    fs::path temp = fs::temp_directory_path(ec);
    if (!ec) candidates.push_back(temp / L"GitAccountSwitcherV2");

    for (const auto& candidate : candidates) {
        if (IsWritableDataDir(candidate)) return PathToUtf8(candidate);
    }
    return PathToUtf8(ExecutableDir() / L"data");
}

}  // namespace

json Account::ToJson() const {
    return json{
        {"id", id},
        {"name", name},
        {"githubUser", githubUser},
        {"gitName", gitName},
        {"email", email},
        {"httpsUser", httpsUser},
        {"sshHost", sshHost},
        {"sshKey", sshKey},
        {"defaultOwner", defaultOwner},
        {"note", note},
        {"authType", authType},
        {"isDefault", isDefault},
    };
}

Account Account::FromJson(const json& value) {
    Account account;
    account.id = SafeString(value, "id");
    account.name = SafeString(value, "name");
    account.githubUser = SafeString(value, "githubUser");
    account.gitName = SafeString(value, "gitName");
    account.email = SafeString(value, "email");
    account.httpsUser = SafeString(value, "httpsUser");
    account.sshHost = SafeString(value, "sshHost");
    account.sshKey = SafeString(value, "sshKey");
    account.defaultOwner = SafeString(value, "defaultOwner");
    account.note = SafeString(value, "note");
    account.authType = NormalizeAuthType(SafeString(value, "authType", "https"));
    account.isDefault = SafeBool(value, "isDefault", false);
    return account;
}

std::string Account::EffectiveGitName() const {
    if (!gitName.empty()) return gitName;
    if (!githubUser.empty()) return githubUser;
    if (!name.empty()) return name;
    return "Git User";
}

std::string Account::EffectiveOwner() const {
    if (!defaultOwner.empty()) return defaultOwner;
    if (!githubUser.empty()) return githubUser;
    if (!httpsUser.empty()) return httpsUser;
    return {};
}

json Settings::ToJson() const {
    return json{
        {"theme", theme},
        {"confirmDestructive", confirmDestructive},
        {"editor", editor},
        {"terminal", terminal},
        {"historyLimit", historyLimit},
    };
}

Settings Settings::FromJson(const json& value) {
    Settings settings;
    settings.theme = SafeString(value, "theme", "dark");
    settings.confirmDestructive = SafeBool(value, "confirmDestructive", true);
    settings.editor = SafeString(value, "editor", "code");
    settings.terminal = SafeString(value, "terminal", "wt");
    settings.historyLimit = SafeInt(value, "historyLimit", 2000);
    return settings;
}

json Config::ToJson() const {
    json accountsJson = json::array();
    for (const auto& account : accounts) accountsJson.push_back(account.ToJson());
    json rootsJson = json::array();
    for (const auto& root : scanRoots) rootsJson.push_back(root);
    return json{
        {"version", version},
        {"scanRoots", rootsJson},
        {"accounts", accountsJson},
        {"settings", settings.ToJson()},
        {"updatedAt", IsoNow()},
    };
}

Config Config::FromJson(const json& value) {
    Config config;
    config.version = 2;
    if (value.is_object() && value.contains("scanRoots") && value["scanRoots"].is_array()) {
        for (const auto& root : value["scanRoots"]) {
            if (root.is_string()) {
                std::string text = Trim(root.get<std::string>());
                if (!text.empty()) config.scanRoots.push_back(text);
            }
        }
    }
    if (value.is_object() && value.contains("accounts") && value["accounts"].is_array()) {
        for (const auto& item : value["accounts"]) {
            if (item.is_object()) config.accounts.push_back(Account::FromJson(item));
        }
    }
    if (value.is_object() && value.contains("settings") && value["settings"].is_object()) {
        config.settings = Settings::FromJson(value["settings"]);
    }
    config.Normalize();
    return config;
}

Config Config::Default() {
    Config config;
    config.version = 2;
    std::string desktop = DesktopDir();
    if (!desktop.empty() && fs::exists(PathFromUtf8(desktop))) config.scanRoots.push_back(desktop);
    if (fs::exists(PathFromUtf8("D:\\"))) config.scanRoots.push_back("D:\\");

    std::string userName = GitGlobalValue("user.name");
    std::string email = GitGlobalValue("user.email");
    std::string login = GetGitHubLoginFromEmail(email);
    if (login.empty()) login = userName;

    Account account;
    account.id = RandomId();
    account.name = login.empty() ? "主账号" : ("主账号（" + login + "）");
    account.githubUser = login;
    account.gitName = userName.empty() ? login : userName;
    account.email = email;
    account.httpsUser = login;
    account.sshHost = "github.com";
    account.defaultOwner = login;
    account.note = "从当前全局 Git 配置自动生成";
    account.authType = "https";
    account.isDefault = true;
    config.accounts.push_back(account);
    config.settings = Settings{};
    config.Normalize();
    return config;
}

std::string Config::DefaultConfigPath() {
    fs::path dir = PathFromUtf8(ResolveDataDir());
    return PathToUtf8(dir / L"config.json");
}

std::string Config::DataDir() {
    return ResolveDataDir();
}

Config Config::Load(const std::string& path) {
    fs::path configPath = PathFromUtf8(path);
    if (!fs::exists(configPath)) return Default();

    std::string content = ReadFileUtf8(configPath);
    if (Trim(content).empty()) return Default();

    try {
        json parsed = json::parse(content);
        Config config = FromJson(parsed);
        return config;
    } catch (const std::exception&) {
        std::string backup = path + ".broken-" + TimestampForFile();
        std::error_code ec;
        fs::copy_file(configPath, PathFromUtf8(backup), fs::copy_options::overwrite_existing, ec);
        return Default();
    }
}

bool Config::Save(const std::string& path) const {
    fs::path configPath = PathFromUtf8(path);
    fs::path dataDir = configPath.parent_path();
    bool dirOk = EnsureDirectory(dataDir);
    std::cerr << "[config] save path=" << path
              << " dir=" << PathToUtf8(dataDir)
              << " dirOk=" << dirOk
              << " attrs=" << GetFileAttributesW(dataDir.c_str())
              << " err=" << GetLastError() << "\n";
    if (!dirOk) return false;

    if (GetFileAttributesW(configPath.c_str()) != INVALID_FILE_ATTRIBUTES) {
        fs::path backupDir = dataDir / L"backups";
        EnsureDirectory(backupDir);
        fs::path backup = backupDir / PathFromUtf8("config-" + TimestampForFile() + ".json");
        CopyFileW(configPath.c_str(), backup.c_str(), FALSE);
    }

    bool saved = WriteFileAtomic(configPath, ToJson().dump(2) + "\n");
    std::cerr << "[config] atomic=" << saved
              << " err=" << GetLastError()
              << " exists=" << (GetFileAttributesW(configPath.c_str()) != INVALID_FILE_ATTRIBUTES)
              << "\n";
    return saved;
}

Account* Config::FindAccount(const std::string& id) {
    for (auto& account : accounts) {
        if (account.id == id) return &account;
    }
    return nullptr;
}

const Account* Config::FindAccount(const std::string& id) const {
    for (const auto& account : accounts) {
        if (account.id == id) return &account;
    }
    return nullptr;
}

Account* Config::DefaultAccount() {
    for (auto& account : accounts) {
        if (account.isDefault) return &account;
    }
    return accounts.empty() ? nullptr : &accounts.front();
}

const Account* Config::DefaultAccount() const {
    for (const auto& account : accounts) {
        if (account.isDefault) return &account;
    }
    return accounts.empty() ? nullptr : &accounts.front();
}

void Config::Normalize() {
    version = 2;
    if (scanRoots.empty()) {
        std::string desktop = DesktopDir();
        if (!desktop.empty()) scanRoots.push_back(desktop);
        if (fs::exists(PathFromUtf8("D:\\"))) scanRoots.push_back("D:\\");
    }

    std::vector<std::string> uniqueRoots;
    for (auto& root : scanRoots) {
        root = Trim(root);
        if (root.empty()) continue;
        bool exists = false;
        for (const auto& existing : uniqueRoots) {
            if (IEquals(existing, root)) {
                exists = true;
                break;
            }
        }
        if (!exists) uniqueRoots.push_back(root);
    }
    scanRoots = uniqueRoots;

    if (accounts.empty()) {
        Account account;
        account.id = RandomId();
        account.name = "主账号";
        account.sshHost = "github.com";
        account.authType = "https";
        account.isDefault = true;
        accounts.push_back(account);
    }

    bool hasDefault = false;
    for (auto& account : accounts) {
        if (account.id.empty()) account.id = RandomId();
        if (account.name.empty()) account.name = account.githubUser.empty() ? "未命名账号" : account.githubUser;
        if (account.sshHost.empty()) account.sshHost = "github.com";
        account.authType = NormalizeAuthType(account.authType);
        if (account.isDefault && !hasDefault) {
            hasDefault = true;
        } else if (account.isDefault) {
            account.isDefault = false;
        }
    }
    if (!hasDefault) accounts.front().isDefault = true;

    if (settings.theme != "dark" && settings.theme != "light" && settings.theme != "sepia") {
        settings.theme = "dark";
    }
    if (settings.historyLimit < 100) settings.historyLimit = 100;
    if (settings.historyLimit > 20000) settings.historyLimit = 20000;
    if (settings.editor.empty()) settings.editor = "code";
    if (settings.terminal.empty()) settings.terminal = "wt";
}

}  // namespace gs
