#pragma once

#include "config.hpp"

namespace gs {

struct RemoteInfo {
    std::string raw;
    std::string protocol;
    std::string host;
    std::string user;
    std::string owner;
    std::string repo;
    bool isGitHub = false;
};

struct GitResult {
    bool ok = false;
    int exitCode = -1;
    bool timedOut = false;
    std::string output;

    std::string Text() const { return Trim(output); }
};

RemoteInfo ParseRemoteUrl(const std::string& url);
std::string BuildRemoteUrl(const Account& account, const std::string& protocol,
                           const std::string& owner, const std::string& repo);
const Account* FindAccountForRemote(const Config& config, const RemoteInfo& remote);

GitResult RunGit(const std::string& repoPath, const std::vector<std::string>& args,
                 bool allowPrompt = false, int timeoutMs = 180000);
GitResult RunGitGlobal(const std::vector<std::string>& args, int timeoutMs = 30000);
bool IsIndexLockError(const std::string& output);
json RepoLockStatusJson(const std::string& path);
json ClearRepoLockJson(const std::string& path, bool force);
std::vector<std::string> SplitLines(const std::string& text);

json RepoInfoJson(const std::string& path, const Config& config, bool includeStatus = false);
json ScanRepos(const Config& config, const std::vector<std::string>& roots);
json RepoStatusJson(const std::string& path);
json RepoDiffJson(const std::string& path, bool staged, const std::string& file);
json RepoShowJson(const std::string& path, const std::string& hash);
json ApplyPatchJson(const std::string& path, const std::string& patch, bool cached, bool reverse);
json RepoBranchesJson(const std::string& path);
json RepoStashesJson(const std::string& path);
json RepoHistoryJson(const std::string& path, const std::string& filter, int limit);
json SwitchRepoAccount(const std::string& path, const Account& account, const std::string& protocol);
json RepoRemotesJson(const std::string& path);
json CheckGitVersion();

}  // namespace gs
