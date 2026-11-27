#pragma once

#include "common.hpp"

namespace gs {

struct Account {
    std::string id;
    std::string name;
    std::string githubUser;
    std::string gitName;
    std::string email;
    std::string httpsUser;
    std::string sshHost;
    std::string sshKey;
    std::string defaultOwner;
    std::string note;
    std::string authType = "https";
    bool isDefault = false;

    json ToJson() const;
    static Account FromJson(const json& value);
    std::string EffectiveGitName() const;
    std::string EffectiveOwner() const;
};

struct Settings {
    std::string theme = "dark";
    bool confirmDestructive = true;
    std::string editor = "code";
    std::string terminal = "wt";
    int historyLimit = 2000;
    json ToJson() const;
    static Settings FromJson(const json& value);
};

struct Config {
    int version = 2;
    std::vector<std::string> scanRoots;
    std::vector<Account> accounts;
    Settings settings;

    json ToJson() const;
    static Config FromJson(const json& value);
    static Config Default();
    static Config Load(const std::string& path);
    bool Save(const std::string& path) const;
    Account* FindAccount(const std::string& id);
    const Account* FindAccount(const std::string& id) const;
    Account* DefaultAccount();
    const Account* DefaultAccount() const;
    void Normalize();

    static std::string DefaultConfigPath();
    static std::string DataDir();
};

}  // namespace gs
