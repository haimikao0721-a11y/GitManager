#include "git.hpp"

#include <tlhelp32.h>

#include <algorithm>
#include <chrono>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <unordered_map>

namespace gs {

namespace {

std::mutex g_repoLocksMutex;
std::unordered_map<std::string, std::shared_ptr<std::mutex>> g_repoLocks;

std::string RepoLockKey(const std::string& path) {
    std::string key = ToLower(Trim(path));
    std::replace(key.begin(), key.end(), '/', '\\');
    while (key.size() > 1 && key.back() == '\\') key.pop_back();
    return key;
}

std::shared_ptr<std::mutex> RepoLock(const std::string& path) {
    std::lock_guard<std::mutex> guard(g_repoLocksMutex);
    const std::string key = RepoLockKey(path);
    std::shared_ptr<std::mutex>& lock = g_repoLocks[key];
    if (!lock) lock = std::make_shared<std::mutex>();
    return lock;
}

std::string StripGitSuffix(std::string repo) {
    if (EndsWith(ToLower(repo), ".git")) repo = repo.substr(0, repo.size() - 4);
    return repo;
}

void SplitOwnerRepo(const std::string& path, std::string& owner, std::string& repo) {
    std::string value = Trim(path);
    while (!value.empty() && (value.front() == '/' || value.front() == '\\')) value.erase(value.begin());
    if (StartsWith(value, "~/")) value = value.substr(2);
    size_t slash = value.find('/');
    if (slash == std::string::npos) {
        repo = StripGitSuffix(value);
        return;
    }
    owner = value.substr(0, slash);
    repo = StripGitSuffix(value.substr(slash + 1));
}

std::string FirstLine(const std::string& text) {
    auto lines = SplitLines(text);
    return lines.empty() ? std::string{} : lines.front();
}

int NextLaneColor(const std::vector<std::string>& targets,
                  const std::vector<int>& colors,
                  int colorCount,
                  int seed) {
    for (int i = 0; i < colorCount; ++i) {
        int candidate = (seed + i) % colorCount;
        bool used = false;
        for (size_t j = 0; j < targets.size(); ++j) {
            if (!targets[j].empty() && colors[j] == candidate) {
                used = true;
                break;
            }
        }
        if (!used) return candidate;
    }
    return seed % colorCount;
}

struct LaneRef {
    int lane = 0;
    int color = 0;
};

struct HistoryRow {
    std::string hash;
    std::vector<std::string> parents;
    std::string date;
    std::string author;
    std::string decorations;
    std::string subject;
    int lane = -1;
    int color = 0;
    bool fromTop = false;
    bool toBottom = false;
    std::vector<LaneRef> through;
    std::vector<LaneRef> incoming;
    std::vector<LaneRef> outgoing;
    int maxLane = 0;
};

json LaneRefsJson(const std::vector<LaneRef>& refs) {
    json out = json::array();
    for (const auto& ref : refs) out.push_back(json{{"lane", ref.lane}, {"color", ref.color}});
    return out;
}

json HistoryRowJson(const HistoryRow& row) {
    json parents = json::array();
    for (const auto& parent : row.parents) parents.push_back(parent);
    return json{
        {"hash", row.hash},
        {"parents", parents},
        {"date", row.date},
        {"author", row.author},
        {"decorations", row.decorations},
        {"subject", row.subject},
        {"lane", row.lane},
        {"color", row.color},
        {"nodeFromTop", row.fromTop},
        {"nodeToBottom", row.toBottom},
        {"through", LaneRefsJson(row.through)},
        {"incoming", LaneRefsJson(row.incoming)},
        {"outgoing", LaneRefsJson(row.outgoing)},
        {"maxLane", row.maxLane},
    };
}

std::pair<std::string, std::string> CurrentBranchAndUpstream(const std::string& path) {
    std::string current = Trim(RunGit(path, {"branch", "--show-current"}, false, 15000).output);
    std::string upstream;
    auto up = RunGit(path, {"rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"}, false, 15000);
    if (up.ok) upstream = Trim(up.output);
    return {current, upstream};
}

std::string StatusLabel(const std::string& xy) {
    if (xy == "??") return "未跟踪";
    static const std::vector<std::string> conflicts = {"DD", "AU", "UD", "UA", "DU", "AA", "UU"};
    for (const auto& code : conflicts) {
        if (xy == code) return "冲突";
    }
    std::string label;
    char x = xy.size() > 0 ? xy[0] : ' ';
    char y = xy.size() > 1 ? xy[1] : ' ';
    auto indexLabel = [](char c) -> std::string {
        switch (c) {
            case 'A': return "新增";
            case 'M': return "修改";
            case 'D': return "删除";
            case 'R': return "重命名";
            case 'C': return "复制";
            default: return {};
        }
    };
    if (x != ' ' && x != '?') label += indexLabel(x) + "（已暂存）";
    if (y != ' ' && y != '?') {
        if (!label.empty()) label += " + ";
        label += indexLabel(y) + "（未暂存）";
    }
    return label.empty() ? xy : label;
}

}  // namespace

RemoteInfo ParseRemoteUrl(const std::string& url) {
    RemoteInfo info;
    info.raw = Trim(url);
    if (info.raw.empty()) return info;

    std::string value = info.raw;
    std::smatch match;
    static const std::regex httpsPattern(
        R"(^(https?)://(?:([^@/]+)@)?([^/:]+)(?::\d+)?/([^/]+)/(.+?)/?$)",
        std::regex::icase);
    static const std::regex sshUrlPattern(
        R"(^ssh://(?:([^@/]+)@)?([^/:]+)(?::\d+)?/(.+)$)",
        std::regex::icase);
    static const std::regex scpPattern(R"(^([^@]+)@([^:]+):(.+)$)");

    if (std::regex_match(value, match, httpsPattern)) {
        info.protocol = ToLower(match[1].str());
        info.user = match[2].matched ? match[2].str() : "";
        info.host = match[3].str();
        info.owner = match[4].str();
        info.repo = StripGitSuffix(match[5].str());
    } else if (std::regex_match(value, match, sshUrlPattern)) {
        info.protocol = "ssh";
        info.user = match[1].matched ? match[1].str() : "";
        info.host = match[2].str();
        SplitOwnerRepo(match[3].str(), info.owner, info.repo);
    } else if (std::regex_match(value, match, scpPattern)) {
        info.protocol = "ssh";
        info.user = match[1].str();
        info.host = match[2].str();
        SplitOwnerRepo(match[3].str(), info.owner, info.repo);
    }

    std::string hostLower = ToLower(info.host);
    info.isGitHub = hostLower == "github.com" ||
                    (hostLower.size() > 11 && hostLower.substr(hostLower.size() - 11) == ".github.com");
    return info;
}

std::string BuildRemoteUrl(const Account& account, const std::string& protocol,
                           const std::string& owner, const std::string& repoName) {
    if (owner.empty() || repoName.empty()) return {};
    std::string repo = StripGitSuffix(Trim(repoName));
    if (protocol == "ssh") {
        std::string host = account.sshHost.empty() ? "github.com" : account.sshHost;
        return "git@" + host + ":" + owner + "/" + repo + ".git";
    }
    if (!account.httpsUser.empty()) {
        return "https://" + account.httpsUser + "@github.com/" + owner + "/" + repo + ".git";
    }
    return "https://github.com/" + owner + "/" + repo + ".git";
}

const Account* FindAccountForRemote(const Config& config, const RemoteInfo& remote) {
    if (remote.protocol.empty()) return nullptr;
    for (const auto& account : config.accounts) {
        if (remote.protocol == "ssh" && !account.sshHost.empty() &&
            IEquals(remote.host, account.sshHost)) {
            return &account;
        }
    }
    for (const auto& account : config.accounts) {
        if (remote.protocol == "https" && !remote.user.empty() &&
            !account.httpsUser.empty() && IEquals(remote.user, account.httpsUser)) {
            return &account;
        }
    }
    for (const auto& account : config.accounts) {
        if (remote.owner.empty()) continue;
        if ((!account.httpsUser.empty() && IEquals(remote.owner, account.httpsUser)) ||
            (!account.defaultOwner.empty() && IEquals(remote.owner, account.defaultOwner)) ||
            (!account.githubUser.empty() && IEquals(remote.owner, account.githubUser))) {
            return &account;
        }
    }
    return nullptr;
}

std::vector<std::string> SplitLines(const std::string& text) {
    std::vector<std::string> lines;
    std::istringstream stream(text);
    std::string line;
    while (std::getline(stream, line)) {
        if (!line.empty() && line.back() == '\r') line.pop_back();
        if (!line.empty()) lines.push_back(line);
    }
    return lines;
}

namespace {

fs::path GitDirForRepo(const std::string& repoPath) {
    fs::path repo = PathFromUtf8(repoPath);
    fs::path dotGit = repo / L".git";
    std::error_code ec;
    if (fs::is_directory(dotGit, ec)) return dotGit;
    if (fs::is_regular_file(dotGit, ec)) {
        std::string text = ReadFileUtf8(dotGit);
        size_t pos = text.find("gitdir:");
        if (pos != std::string::npos) {
            fs::path gitDir = PathFromUtf8(Trim(text.substr(pos + 7)));
            if (gitDir.is_relative()) gitDir = repo / gitDir;
            return gitDir;
        }
    }
    return {};
}

bool IsLockFileHeld(const fs::path& lock) {
    HANDLE handle = CreateFileW(lock.c_str(), GENERIC_READ, 0, nullptr, OPEN_EXISTING,
                                FILE_ATTRIBUTE_NORMAL, nullptr);
    if (handle == INVALID_HANDLE_VALUE) {
        DWORD error = GetLastError();
        return error == ERROR_SHARING_VIOLATION || error == ERROR_LOCK_VIOLATION;
    }
    CloseHandle(handle);
    return false;
}

int CountGitProcesses() {
    HANDLE snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
    if (snapshot == INVALID_HANDLE_VALUE) return 0;
    PROCESSENTRY32W entry{};
    entry.dwSize = sizeof(entry);
    int count = 0;
    if (Process32FirstW(snapshot, &entry)) {
        do {
            if (_wcsicmp(entry.szExeFile, L"git.exe") == 0) ++count;
        } while (Process32NextW(snapshot, &entry));
    }
    CloseHandle(snapshot);
    return count;
}

bool IsGitDirWritable(const fs::path& gitDir, DWORD* error = nullptr) {
    fs::path probe = gitDir /
                     (L"git-manager-write-test-" + std::to_wstring(GetCurrentProcessId()) +
                      L"-" + std::to_wstring(GetTickCount64()));
    HANDLE handle = CreateFileW(probe.c_str(), GENERIC_WRITE, 0, nullptr, CREATE_ALWAYS,
                                FILE_ATTRIBUTE_TEMPORARY, nullptr);
    if (handle == INVALID_HANDLE_VALUE) {
        if (error) *error = GetLastError();
        return false;
    }
    CloseHandle(handle);
    std::error_code ec;
    fs::remove(probe, ec);
    if (error) *error = 0;
    return true;
}

GitResult RunGitOnce(const std::string& repoPath, const std::vector<std::string>& args,
                     bool allowPrompt, int timeoutMs) {
    std::vector<std::wstring> wide;
    if (!repoPath.empty()) {
        wide.push_back(L"-C");
        wide.push_back(Utf8ToWide(repoPath));
    }
    wide.push_back(L"-c");
    wide.push_back(L"core.quotepath=false");
    wide.push_back(L"-c");
    wide.push_back(L"i18n.logOutputEncoding=UTF-8");
    for (const auto& arg : args) wide.push_back(Utf8ToWide(arg));

    std::vector<std::pair<std::wstring, std::wstring>> env{
        {L"GIT_TERMINAL_PROMPT", L"0"},
        {L"GCM_INTERACTIVE", allowPrompt ? L"auto" : L"Never"},
        // Read-only commands such as `git status` must not take index.lock.
        {L"GIT_OPTIONAL_LOCKS", L"0"},
        {L"LANG", L"C"},
        {L"LC_ALL", L"C"},
    };
    ProcessResult process = RunProcess(L"git.exe", wide, L"", env, timeoutMs);
    GitResult result;
    result.exitCode = process.exitCode;
    result.timedOut = process.timedOut;
    result.output = process.output;
    result.ok = process.launched && !process.timedOut && process.exitCode == 0;
    return result;
}

}  // namespace

bool IsIndexLockError(const std::string& output) {
    std::string lower = ToLower(output);
    if (lower.find("index.lock") == std::string::npos) return false;
    return lower.find("permission denied") != std::string::npos ||
           lower.find("file exists") != std::string::npos ||
           lower.find("unable to create") != std::string::npos ||
           lower.find("another git process") != std::string::npos;
}

json RepoLockStatusJson(const std::string& path) {
    json result{
        {"exists", false},
        {"path", ""},
        {"ageMs", 0},
        {"held", false},
        {"stale", false},
        {"activeGit", CountGitProcesses()},
        {"writable", false},
        {"writeError", 0},
        {"error", ""},
    };
    fs::path gitDir = GitDirForRepo(path);
    if (gitDir.empty()) {
        result["error"] = "找不到 .git 目录";
        return result;
    }
    fs::path lock = gitDir / L"index.lock";
    result["path"] = PathToUtf8(lock);
    DWORD writeError = 0;
    result["writable"] = IsGitDirWritable(gitDir, &writeError);
    result["writeError"] = writeError;
    std::error_code ec;
    if (fs::exists(lock, ec)) {
        result["exists"] = true;
        result["held"] = IsLockFileHeld(lock);
        auto written = fs::last_write_time(lock, ec);
        if (!ec) {
            auto age = std::chrono::duration_cast<std::chrono::milliseconds>(
                           fs::file_time_type::clock::now() - written)
                           .count();
            if (age < 0) age = 0;
            result["ageMs"] = age;
            result["stale"] = age > 60000;
        }
    }
    return result;
}

json ClearRepoLockJson(const std::string& path, bool force) {
    fs::path gitDir = GitDirForRepo(path);
    if (gitDir.empty()) throw std::runtime_error("找不到 .git 目录。");
    fs::path lock = gitDir / L"index.lock";
    std::error_code ec;
    if (!fs::exists(lock, ec)) {
        return json{{"cleared", false}, {"message", "index.lock 不存在"}};
    }
    if (IsLockFileHeld(lock)) {
        throw std::runtime_error(
            "index.lock 正被另一个 Git 进程持有，不能强制删除。请等待该操作结束后重试。");
    }
    fs::path backup = lock;
    backup += L".stale-" + std::to_wstring(GetTickCount64());
    fs::rename(lock, backup, ec);
    if (ec) {
        ec.clear();
        fs::remove(lock, ec);
        backup.clear();
    }
    if (ec) throw std::runtime_error("清理 index.lock 失败，请检查 .git 目录权限。");
    (void)force;
    return json{{"cleared", true}, {"backup", PathToUtf8(backup)}};
}

GitResult RunGit(const std::string& repoPath, const std::vector<std::string>& args,
                 bool allowPrompt, int timeoutMs) {
    std::unique_lock<std::mutex> guard;
    if (!repoPath.empty()) {
        guard = std::unique_lock<std::mutex>(*RepoLock(repoPath));
    }

    // A repository has one index.lock. Other Git clients (Cursor, PyCharm, a
    // running `git status`) can hold it for a moment, so wait/retry instead of
    // failing the user's checkout/stage immediately.
    constexpr int kMaxRetries = 9;
    static const DWORD kDelaysMs[kMaxRetries] = {150, 300, 500, 800, 1200,
                                                 1600, 2000, 2500, 3000};
    for (int attempt = 0;; ++attempt) {
        GitResult result = RunGitOnce(repoPath, args, allowPrompt, timeoutMs);
        if (result.ok || attempt >= kMaxRetries || !IsIndexLockError(result.output)) {
            return result;
        }
        if (guard.owns_lock()) guard.unlock();
        // Poll: another client may be mid-write. The UI offers an explicit
        // "clear lock and retry" action if this wait is not enough.
        Sleep(kDelaysMs[attempt]);
        if (guard.owns_lock() == false && !repoPath.empty()) guard.lock();
    }
}

GitResult RunGitGlobal(const std::vector<std::string>& args, int timeoutMs) {
    return RunGit("", args, false, timeoutMs);
}

json CheckGitVersion() {
    auto where = RunProcess(L"where.exe", {L"git"}, L"", 10000);
    auto version = RunGitGlobal({"version"}, 10000);
    bool whereOk = where.launched && where.exitCode == 0;
    json result{
        {"installed", version.ok},
        {"version", version.ok ? version.Text() : ""},
        {"path", whereOk ? FirstLine(where.output) : ""},
    };
    return result;
}

json RepoInfoJson(const std::string& path, const Config& config, bool includeStatus) {
    json info{
        {"path", path},
        {"name", PathToUtf8(PathFromUtf8(path).filename())},
        {"branch", ""},
        {"detached", false},
        {"remoteName", ""},
        {"url", ""},
        {"protocol", ""},
        {"host", ""},
        {"owner", ""},
        {"repo", ""},
        {"isGitHub", false},
        {"accountId", ""},
        {"accountName", ""},
        {"lastCommitHash", ""},
        {"lastCommitDate", ""},
        {"lastCommitSubject", ""},
        {"dirty", false},
        {"ahead", 0},
        {"behind", 0},
    };

    auto remotes = RunGit(path, {"remote"}, false, 15000);
    std::vector<std::string> remoteNames = SplitLines(remotes.output);
    std::string remoteName;
    for (const auto& name : remoteNames) {
        if (name == "origin") {
            remoteName = name;
            break;
        }
    }
    if (remoteName.empty() && !remoteNames.empty()) remoteName = remoteNames.front();
    info["remoteName"] = remoteName;
    const Account* matchedAccount = nullptr;

    if (!remoteName.empty()) {
        auto url = RunGit(path, {"remote", "get-url", remoteName}, false, 15000);
        if (url.ok) {
            std::string remoteUrl = Trim(url.output);
            info["url"] = remoteUrl;
            RemoteInfo remote = ParseRemoteUrl(remoteUrl);
            info["protocol"] = remote.protocol;
            info["host"] = remote.host;
            info["owner"] = remote.owner;
            info["repo"] = remote.repo;
            info["isGitHub"] = remote.isGitHub;
            const Account* account = FindAccountForRemote(config, remote);
            if (account) {
                matchedAccount = account;
                info["accountId"] = account->id;
                info["accountName"] = account->name;
            }
        }
    }

    auto userName = Trim(RunGit(path, {"config", "--get", "user.name"}, false, 15000).output);
    auto userEmail = Trim(RunGit(path, {"config", "--get", "user.email"}, false, 15000).output);
    info["userName"] = userName;
    info["userEmail"] = userEmail;
    info["identityMismatch"] =
        matchedAccount && !Trim(matchedAccount->email).empty() && !userEmail.empty() &&
        !IEquals(userEmail, Trim(matchedAccount->email));

    std::string branch = Trim(RunGit(path, {"branch", "--show-current"}, false, 15000).output);
    if (branch.empty()) {
        auto rev = RunGit(path, {"rev-parse", "--short", "HEAD"}, false, 15000);
        if (rev.ok) {
            info["detached"] = true;
            branch = Trim(rev.output);
        }
    }
    info["branch"] = branch;

    auto last = RunGit(path, {"log", "-1", "--date=short", "--format=%h%x1f%ad%x1f%s"}, false, 15000);
    if (last.ok) {
        auto parts = Split(last.output, '\x1f', 3);
        if (parts.size() >= 3) {
            info["lastCommitHash"] = Trim(parts[0]);
            info["lastCommitDate"] = Trim(parts[1]);
            info["lastCommitSubject"] = Trim(parts[2]);
        }
    }

    if (includeStatus) {
        json status = RepoStatusJson(path);
        info["dirty"] = !status["files"].empty();
        info["ahead"] = status.value("ahead", 0);
        info["behind"] = status.value("behind", 0);
        info["hasConflicts"] = status.value("hasConflicts", false);
    }
    return info;
}

json ScanRepos(const Config& config, const std::vector<std::string>& roots) {
    static const std::vector<std::string> skip = {
        "node_modules", ".venv", "venv", "env", ".env", "dist", "build", "out",
        "target", "bin", "obj", "vendor", "__pycache__", ".next", ".nuxt", ".cache",
        ".idea", ".vs", ".gradle", ".m2", "packages", "appdata", "windows",
        "$recycle.bin", "system volume information", ".git", "backups", "logs",
        ".pnpm-store", "pnpm-store", ".yarn", ".npm", ".cargo", ".rustup", ".nuget",
        ".vscode-server", ".local", ".dotnet"};

    std::vector<std::string> scanRoots = roots;
    if (scanRoots.empty()) scanRoots = config.scanRoots;

    std::vector<std::string> repoPaths;
    std::unordered_map<std::string, bool> seen;
    for (const auto& root : scanRoots) {
        if (root.empty()) continue;
        fs::path rootPath = PathFromUtf8(root);
        std::error_code ec;
        if (!fs::exists(rootPath, ec) || !fs::is_directory(rootPath, ec)) continue;

        struct Item {
            fs::path path;
            int depth;
        };
        std::vector<Item> queue{{rootPath, 0}};
        size_t index = 0;
        while (index < queue.size()) {
            Item item = queue[index++];
            std::error_code gitEc;
            fs::path gitPath = item.path / L".git";
            if (fs::exists(gitPath, gitEc)) {
                std::string normalized = ToLower(PathToUtf8(item.path));
                if (!seen[normalized]) {
                    seen[normalized] = true;
                    repoPaths.push_back(PathToUtf8(item.path));
                }
            }
            if (item.depth >= 8) continue;

            std::error_code dirEc;
            fs::directory_iterator it(item.path, fs::directory_options::skip_permission_denied, dirEc);
            if (dirEc) continue;
            for (const auto& entry : it) {
                std::error_code typeEc;
                if (!entry.is_directory(typeEc) || typeEc) continue;
                if (entry.is_symlink(typeEc) && !typeEc) continue;
                std::string name = ToLower(PathToUtf8(entry.path().filename()));
                if (std::find(skip.begin(), skip.end(), name) != skip.end()) continue;
                queue.push_back({entry.path(), item.depth + 1});
            }
        }
    }

    std::sort(repoPaths.begin(), repoPaths.end(), [](const std::string& a, const std::string& b) {
        return ToLower(a) < ToLower(b);
    });

    json repos = json::array();
    for (const auto& repo : repoPaths) repos.push_back(RepoInfoJson(repo, config, false));
    return json{{"repos", repos}, {"count", repos.size()}, {"roots", scanRoots}};
}

json RepoStatusJson(const std::string& path) {
    auto [current, upstream] = CurrentBranchAndUpstream(path);
    json result{
        {"branch", current},
        {"upstream", upstream},
        {"ahead", 0},
        {"behind", 0},
        {"files", json::array()},
        {"hasConflicts", false},
    };

    if (!upstream.empty()) {
        auto counts = RunGit(path, {"rev-list", "--left-right", "--count", upstream + "...HEAD"},
                             false, 15000);
        if (counts.ok) {
            auto parts = SplitWhitespace(Trim(counts.output));
            if (parts.size() >= 2) {
                result["behind"] = std::stoi(parts[0]);
                result["ahead"] = std::stoi(parts[1]);
            }
        }
    }

    auto status = RunGit(path, {"status", "--porcelain=v1"}, false, 30000);
    if (!status.ok) {
        result["error"] = status.Text();
        return result;
    }

    static const std::vector<std::string> conflicts = {"DD", "AU", "UD", "UA", "DU", "AA", "UU"};
    json files = json::array();
    for (const auto& line : SplitLines(status.output)) {
        if (line.size() < 3) continue;
        std::string xy = line.substr(0, 2);
        std::string rest = line.substr(3);
        std::string pathValue = rest;
        std::string displayPath = rest;
        size_t renamePos = rest.find(" -> ");
        if ((xy[0] == 'R' || xy[0] == 'C') && renamePos != std::string::npos) {
            pathValue = rest.substr(renamePos + 4);
        }
        bool untracked = xy == "??";
        bool conflicted = std::find(conflicts.begin(), conflicts.end(), xy) != conflicts.end();
        bool staged = xy[0] != ' ' && xy[0] != '?';
        bool unstaged = xy[1] != ' ' && xy[1] != '?';
        bool hidden = false;
        fs::path fullPath = PathFromUtf8(path) / PathFromUtf8(pathValue);
        DWORD attributes = GetFileAttributesW(fullPath.c_str());
        if (attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_HIDDEN)) {
            hidden = true;
        }
        if (conflicted) result["hasConflicts"] = true;
        files.push_back(json{
            {"xy", xy},
            {"path", pathValue},
            {"displayPath", displayPath},
            {"label", StatusLabel(xy)},
            {"staged", staged},
            {"unstaged", unstaged},
            {"untracked", untracked},
            {"conflicted", conflicted},
            {"hidden", hidden},
        });
    }
    result["files"] = files;
    return result;
}

json RepoDiffJson(const std::string& path, bool staged, const std::string& file) {
    std::vector<std::string> args = {"diff", "--no-ext-diff", "--no-color", "--unified=3"};
    if (staged) args.push_back("--cached");
    args.push_back("--");
    if (!file.empty()) args.push_back(file);
    auto result = RunGit(path, args, false, 60000);
    if (!result.ok) {
        return json{{"diff", ""}, {"error", result.Text()}};
    }
    if (result.output.empty() && !staged && !file.empty()) {
        auto fileStatus = RunGit(path, {"status", "--porcelain", "--", file}, false, 15000);
        if (fileStatus.ok && StartsWith(Trim(fileStatus.output), "??")) {
            auto untracked = RunGit(path,
                                    {"diff", "--no-index", "--no-color", "--unified=3",
                                     "--", "/dev/null", file},
                                    false, 60000);
            if (untracked.output.find("diff --git") != std::string::npos) {
                return json{{"diff", untracked.output}};
            }
        }
    }
    return json{{"diff", result.output}};
}

json RepoShowJson(const std::string& path, const std::string& hash) {
    static const std::regex hashPattern(R"(^[0-9a-fA-F]{4,40}$)");
    if (!std::regex_match(hash, hashPattern)) {
        throw std::runtime_error("无效的提交哈希。");
    }
    auto result = RunGit(path,
                         {"show", "--no-ext-diff", "--no-color", "--unified=3",
                          "--format=", hash, "--"},
                         false, 120000);
    if (!result.ok) {
        return json{{"diff", ""}, {"error", result.Text()}};
    }
    return json{{"diff", result.output}};
}

json ApplyPatchJson(const std::string& path, const std::string& patch, bool cached,
                    bool reverse) {
    if (Trim(patch).empty()) {
        throw std::runtime_error("补丁内容为空。");
    }
    std::error_code ec;
    std::vector<fs::path> dirs;
    dirs.push_back(fs::temp_directory_path(ec));
    dirs.push_back(fs::current_path(ec));
    dirs.push_back(PathFromUtf8(path) / L".git");
    fs::path patchPath;
    for (const auto& dir : dirs) {
        if (dir.empty()) continue;
        fs::path candidate = dir /
                             ("git-manager-patch-" + std::to_string(GetCurrentProcessId()) +
                              "-" + std::to_string(GetTickCount64()) + ".patch");
        std::ofstream file(candidate, std::ios::binary | std::ios::trunc);
        if (!file) continue;
        file.write(patch.data(), static_cast<std::streamsize>(patch.size()));
        if (!patch.empty() && patch.back() != '\n') file.put('\n');
        if (file) {
            patchPath = candidate;
            break;
        }
        file.close();
        std::error_code removeError;
        fs::remove(candidate, removeError);
    }
    if (patchPath.empty()) throw std::runtime_error("无法创建临时补丁文件。");

    std::vector<std::string> args = {"apply", "--unidiff-zero", "--whitespace=nowarn"};
    if (cached) args.push_back("--cached");
    if (reverse) args.push_back("--reverse");
    args.push_back(PathToUtf8(patchPath));
    auto result = RunGit(path, args, false, 60000);
    std::error_code removeError;
    fs::remove(patchPath, removeError);
    if (!result.ok) throw std::runtime_error(result.Text());
    return json{{"output", result.Text()}};
}

json RepoBranchesJson(const std::string& path) {
    auto [current, upstream] = CurrentBranchAndUpstream(path);
    const std::string format =
        "%(refname)|%(refname:short)|%(upstream:short)|%(objectname:short)|%(committerdate:relative)|%(contents:subject)";
    auto result = RunGit(path, {"for-each-ref", "--format=" + format, "refs/heads", "refs/remotes"},
                         false, 30000);
    json branches = json::array();
    if (!result.ok) return json{{"branches", branches}, {"current", current}, {"error", result.Text()}};

    for (const auto& line : SplitLines(result.output)) {
        auto parts = Split(line, '|', 6);
        if (parts.size() < 6) continue;
        if (EndsWith(parts[0], "/HEAD")) continue;
        std::string type = StartsWith(parts[0], "refs/heads/") ? "local" : "remote";
        branches.push_back(json{
            {"refName", parts[0]},
            {"shortName", parts[1]},
            {"type", type},
            {"upstream", parts[2]},
            {"hash", parts[3]},
            {"date", parts[4]},
            {"subject", parts[5]},
            {"isCurrent", type == "local" && parts[1] == current},
        });
    }

    std::sort(branches.begin(), branches.end(), [](const json& a, const json& b) {
        std::string ta = a.value("type", "");
        std::string tb = b.value("type", "");
        if (ta != tb) return ta == "local";
        return ToLower(a.value("shortName", "")) < ToLower(b.value("shortName", ""));
    });
    return json{{"branches", branches}, {"current", current}, {"upstream", upstream}};
}

json RepoStashesJson(const std::string& path) {
    auto result = RunGit(path, {"stash", "list", "--format=%gd%x1f%s%x1f%ci"}, false, 30000);
    json stashes = json::array();
    if (!result.ok) return json{{"stashes", stashes}, {"count", 0}, {"error", result.Text()}};

    static const std::regex indexPattern(R"(stash@\{(\d+)\})");
    for (const auto& line : SplitLines(result.output)) {
        auto parts = Split(line, '\x1f', 3);
        if (parts.size() < 3) continue;
        std::smatch match;
        int index = 0;
        if (std::regex_search(parts[0], match, indexPattern)) index = std::stoi(match[1].str());
        stashes.push_back(json{
            {"ref", parts[0]},
            {"index", index},
            {"message", parts[1]},
            {"date", parts[2]},
        });
    }
    return json{{"stashes", stashes}, {"count", stashes.size()}};
}

json RepoHistoryJson(const std::string& path, const std::string& filter, int limit) {
    auto [current, upstream] = CurrentBranchAndUpstream(path);
    std::vector<std::string> revs;
    std::string filterLabel;

    if (filter == "all") {
        revs = {"--branches", "--remotes", "--tags"};
        filterLabel = "全部";
    } else if (filter.empty() || filter == "current") {
        if (!current.empty()) revs.push_back(current);
        if (!upstream.empty() && upstream != current) revs.push_back(upstream);
        if (revs.empty()) {
            revs = {"--branches", "--remotes", "--tags"};
            filterLabel = "全部";
        } else {
            filterLabel = Join(revs, " + ");
        }
    } else {
        revs = {filter};
        filterLabel = filter;
    }

    std::vector<std::string> logArgs = {
        "log", "--topo-order", "--date=short", "--decorate=short",
        "--pretty=format:%x1f%h%x1f%p%x1f%ad%x1f%an%x1f%d%x1f%s"};
    if (limit > 0) logArgs.push_back("--max-count=" + std::to_string(limit));
    for (const auto& rev : revs) logArgs.push_back(rev);
    logArgs.push_back("--");

    auto log = RunGit(path, logArgs, false, 60000);
    std::vector<HistoryRow> rows;
    if (log.ok) {
        for (const auto& line : SplitLines(log.output)) {
            auto parts = Split(line, '\x1f', 7);
            if (parts.size() < 7) continue;
            HistoryRow row;
            row.hash = parts[1];
            for (const auto& parent : SplitWhitespace(parts[2])) row.parents.push_back(parent);
            row.date = parts[3];
            row.author = parts[4];
            row.decorations = Trim(parts[5]);
            row.subject = parts[6];
            rows.push_back(row);
        }
    }

    // Lane layout: each row is one commit, lanes point at future parent hashes.
    std::vector<std::string> targets;
    std::vector<int> colors;
    int colorSeq = 0;
    const int colorCount = 8;

    for (auto& row : rows) {
        std::vector<int> hits;
        for (size_t i = 0; i < targets.size(); ++i) {
            if (!targets[i].empty() && targets[i] == row.hash) hits.push_back(static_cast<int>(i));
        }

        bool fromTop = !hits.empty();
        int nodeLane = -1;
        if (fromTop) {
            nodeLane = hits.front();
        } else {
            for (size_t i = 0; i < targets.size(); ++i) {
                if (targets[i].empty()) {
                    nodeLane = static_cast<int>(i);
                    break;
                }
            }
            if (nodeLane < 0) {
                targets.push_back({});
                colors.push_back(0);
                nodeLane = static_cast<int>(targets.size()) - 1;
            }
            colors[nodeLane] = NextLaneColor(targets, colors, colorCount, colorSeq++);
        }
        row.lane = nodeLane;
        row.color = colors[nodeLane];
        row.fromTop = fromTop;

        for (size_t i = 0; i < targets.size(); ++i) {
            if (!targets[i].empty() && std::find(hits.begin(), hits.end(), static_cast<int>(i)) == hits.end()) {
                row.through.push_back({static_cast<int>(i), colors[i]});
            }
        }

        for (int hit : hits) {
            if (hit == nodeLane) continue;
            row.incoming.push_back({hit, colors[hit]});
            targets[hit].clear();
        }

        if (!row.parents.empty()) {
            targets[nodeLane] = row.parents.front();
            row.toBottom = true;
            for (size_t pi = 1; pi < row.parents.size(); ++pi) {
                const std::string& parent = row.parents[pi];
                int existing = -1;
                for (size_t i = 0; i < targets.size(); ++i) {
                    if (static_cast<int>(i) == nodeLane) continue;
                    if (!targets[i].empty() && targets[i] == parent) {
                        existing = static_cast<int>(i);
                        break;
                    }
                }
                if (existing >= 0) {
                    row.outgoing.push_back({existing, colors[existing]});
                    continue;
                }
                int freeLane = -1;
                for (size_t i = 0; i < targets.size(); ++i) {
                    if (targets[i].empty()) {
                        freeLane = static_cast<int>(i);
                        break;
                    }
                }
                if (freeLane < 0) {
                    targets.push_back({});
                    colors.push_back(0);
                    freeLane = static_cast<int>(targets.size()) - 1;
                }
                int newColor = NextLaneColor(targets, colors, colorCount, colorSeq++);
                targets[freeLane] = parent;
                colors[freeLane] = newColor;
                row.outgoing.push_back({freeLane, newColor});
            }
        } else {
            targets[nodeLane].clear();
        }

        row.maxLane = nodeLane;
        for (const auto& ref : row.through) row.maxLane = std::max(row.maxLane, ref.lane);
        for (const auto& ref : row.incoming) row.maxLane = std::max(row.maxLane, ref.lane);
        for (const auto& ref : row.outgoing) row.maxLane = std::max(row.maxLane, ref.lane);
    }

    json rowsJson = json::array();
    for (const auto& row : rows) rowsJson.push_back(HistoryRowJson(row));

    int count = static_cast<int>(rows.size());
    std::vector<std::string> countArgs = {"rev-list", "--count"};
    for (const auto& rev : revs) countArgs.push_back(rev);
    auto countResult = RunGit(path, countArgs, false, 30000);
    if (countResult.ok) {
        try {
            count = std::stoi(Trim(countResult.output));
        } catch (...) {
        }
    }

    return json{
        {"rows", rowsJson},
        {"count", count},
        {"shown", rows.size()},
        {"filterLabel", filterLabel},
        {"current", current},
        {"upstream", upstream},
        {"limit", limit},
        {"error", log.ok ? "" : log.Text()},
    };
}

json SwitchRepoAccount(const std::string& path, const Account& account,
                       const std::string& requestedProtocol) {
    auto remotes = RunGit(path, {"remote"}, false, 15000);
    std::vector<std::string> names = SplitLines(remotes.output);
    std::string remoteName;
    for (const auto& name : names) {
        if (name == "origin") {
            remoteName = name;
            break;
        }
    }
    if (remoteName.empty() && !names.empty()) remoteName = names.front();
    if (remoteName.empty()) throw std::runtime_error("仓库没有配置 remote，请先添加远程地址。");

    auto urlResult = RunGit(path, {"remote", "get-url", remoteName}, false, 15000);
    if (!urlResult.ok) throw std::runtime_error("读取 remote 地址失败：" + urlResult.Text());
    std::string currentUrl = Trim(urlResult.output);
    RemoteInfo remote = ParseRemoteUrl(currentUrl);
    if (remote.owner.empty() || remote.repo.empty()) {
        throw std::runtime_error("无法从当前 remote 解析 owner/repo：" + currentUrl);
    }

    std::string protocol = requestedProtocol;
    if (protocol != "ssh" && protocol != "https") {
        protocol = remote.protocol == "ssh" ? "ssh" : "https";
    }
    std::string newUrl = BuildRemoteUrl(account, protocol, remote.owner, remote.repo);
    if (newUrl.empty()) throw std::runtime_error("生成的 remote 地址为空。");

    auto setUrl = RunGit(path, {"remote", "set-url", remoteName, newUrl}, false, 15000);
    if (!setUrl.ok) throw std::runtime_error("设置 remote 失败：" + setUrl.Text());

    if (!account.EffectiveGitName().empty()) {
        auto nameResult = RunGit(path, {"config", "user.name", account.EffectiveGitName()}, false, 15000);
        if (!nameResult.ok) throw std::runtime_error("设置 user.name 失败：" + nameResult.Text());
    }
    if (!account.email.empty()) {
        auto emailResult = RunGit(path, {"config", "user.email", account.email}, false, 15000);
        if (!emailResult.ok) throw std::runtime_error("设置 user.email 失败：" + emailResult.Text());
    }

    return json{
        {"url", newUrl},
        {"remoteName", remoteName},
        {"protocol", protocol},
        {"owner", remote.owner},
        {"repo", remote.repo},
        {"accountId", account.id},
        {"accountName", account.name},
        {"gitName", account.EffectiveGitName()},
        {"email", account.email},
    };
}

json RepoRemotesJson(const std::string& path) {
    auto result = RunGit(path, {"remote"}, false, 15000);
    json remotes = json::array();
    if (!result.ok) return json{{"remotes", remotes}};
    for (const auto& name : SplitLines(result.output)) {
        auto urlResult = RunGit(path, {"remote", "get-url", name}, false, 15000);
        remotes.push_back(json{{"name", name}, {"url", urlResult.ok ? Trim(urlResult.output) : ""}});
    }
    return json{{"remotes", remotes}};
}

}  // namespace gs
