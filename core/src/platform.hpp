#pragma once

#include "config.hpp"

namespace gs {

// Credentials (Windows Credential Manager)
json CredentialsList();
json CredentialGet(const std::string& target);
void CredentialDelete(const std::string& target);
void CredentialsClearGitHub();
void CredentialStore(const std::string& target, const std::string& userName,
                     const std::string& secret, bool localMachine = true);

// Git / system proxy
json GitProxyGet();
void GitProxySet(const std::string& url);
void GitProxyClear();
json SystemProxyGet();
void SystemProxySet(const std::string& server);
void SystemProxyClear();

// SSH
json SshList();
json SshGenerate(const std::string& keyPath, const std::string& comment, bool overwrite);
json SshUpsertConfig(const std::string& host, const std::string& hostName,
                     const std::string& user, const std::string& identityFile);
json SshTest(const std::string& host);

// GitHub REST API
json GitHubTest(const std::string& token);
json GitHubListRepos(const std::string& token);
json GitHubCreateRepo(const std::string& token, const std::string& name, bool isPrivate,
                      const std::string& description, bool autoInit);

}  // namespace gs
