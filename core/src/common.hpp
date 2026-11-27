#pragma once

#define NOMINMAX
#define WIN32_LEAN_AND_MEAN

#include <windows.h>
#include <sddl.h>

#include <algorithm>
#include <chrono>
#include <cctype>
#include <cstdint>
#include <ctime>
#include <cwchar>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iomanip>
#include <map>
#include <mutex>
#include <optional>
#include <random>
#include <regex>
#include <sstream>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

#include "json.hpp"

namespace fs = std::filesystem;
using json = nlohmann::json;

namespace gs {

inline std::string WideToUtf8(const std::wstring& value) {
    if (value.empty()) return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), nullptr, 0, nullptr, nullptr);
    if (size <= 0) return {};
    std::string out(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()), out.data(), size, nullptr, nullptr);
    return out;
}

inline std::wstring Utf8ToWide(const std::string& value) {
    if (value.empty()) return {};
    int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), nullptr, 0);
    if (size <= 0) {
        size = MultiByteToWideChar(CP_ACP, 0, value.data(), static_cast<int>(value.size()), nullptr, 0);
        if (size <= 0) return {};
        std::wstring out(static_cast<size_t>(size), L'\0');
        MultiByteToWideChar(CP_ACP, 0, value.data(), static_cast<int>(value.size()), out.data(), size);
        return out;
    }
    std::wstring out(static_cast<size_t>(size), L'\0');
    MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, value.data(), static_cast<int>(value.size()), out.data(), size);
    return out;
}

inline std::string Trim(const std::string& value) {
    size_t begin = 0;
    size_t end = value.size();
    while (begin < end && std::isspace(static_cast<unsigned char>(value[begin]))) ++begin;
    while (end > begin && std::isspace(static_cast<unsigned char>(value[end - 1]))) --end;
    return value.substr(begin, end - begin);
}

inline std::wstring Trim(const std::wstring& value) {
    size_t begin = 0;
    size_t end = value.size();
    while (begin < end && iswspace(value[begin])) ++begin;
    while (end > begin && iswspace(value[end - 1])) --end;
    return value.substr(begin, end - begin);
}

inline std::string ToLower(std::string value) {
    std::transform(value.begin(), value.end(), value.begin(), [](unsigned char c) {
        return static_cast<char>(std::tolower(c));
    });
    return value;
}

inline bool IEquals(const std::string& a, const std::string& b) {
    return ToLower(a) == ToLower(b);
}

inline bool StartsWith(const std::string& value, const std::string& prefix) {
    return value.size() >= prefix.size() && value.compare(0, prefix.size(), prefix) == 0;
}

inline bool EndsWith(const std::string& value, const std::string& suffix) {
    return value.size() >= suffix.size() &&
           value.compare(value.size() - suffix.size(), suffix.size(), suffix) == 0;
}

inline std::vector<std::string> Split(const std::string& value, char delim, size_t maxParts = 0) {
    std::vector<std::string> out;
    size_t start = 0;
    while (start <= value.size()) {
        size_t pos = value.find(delim, start);
        if (pos == std::string::npos || (maxParts > 0 && out.size() + 1 >= maxParts)) {
            out.push_back(value.substr(start));
            break;
        }
        out.push_back(value.substr(start, pos - start));
        start = pos + 1;
    }
    return out;
}

inline std::vector<std::string> SplitWhitespace(const std::string& value) {
    std::vector<std::string> out;
    std::istringstream stream(value);
    std::string part;
    while (stream >> part) out.push_back(part);
    return out;
}

inline std::string Join(const std::vector<std::string>& values, const std::string& sep) {
    std::string out;
    for (size_t i = 0; i < values.size(); ++i) {
        if (i) out += sep;
        out += values[i];
    }
    return out;
}

inline std::string ReplaceAll(std::string value, const std::string& from, const std::string& to) {
    if (from.empty()) return value;
    size_t pos = 0;
    while ((pos = value.find(from, pos)) != std::string::npos) {
        value.replace(pos, from.size(), to);
        pos += to.size();
    }
    return value;
}

inline std::string ShellQuote(const std::string& value) {
    // Only used for log messages; never for process creation.
    return "\"" + ReplaceAll(value, "\"", "\\\"") + "\"";
}

inline std::string GetEnvUtf8(const char* name, const std::string& fallback = {}) {
    DWORD needed = GetEnvironmentVariableW(Utf8ToWide(name).c_str(), nullptr, 0);
    if (needed == 0) return fallback;
    std::wstring buffer(needed, L'\0');
    DWORD written = GetEnvironmentVariableW(Utf8ToWide(name).c_str(), buffer.data(), needed);
    if (written == 0) return fallback;
    buffer.resize(written);
    return WideToUtf8(buffer);
}

inline std::wstring GetEnvWide(const wchar_t* name, const std::wstring& fallback = {}) {
    DWORD needed = GetEnvironmentVariableW(name, nullptr, 0);
    if (needed == 0) return fallback;
    std::wstring buffer(needed, L'\0');
    DWORD written = GetEnvironmentVariableW(name, buffer.data(), needed);
    if (written == 0) return fallback;
    buffer.resize(written);
    return buffer;
}

inline std::string HomeDir() {
    std::string home = GetEnvUtf8("USERPROFILE");
    if (home.empty()) home = GetEnvUtf8("HOME");
    return home;
}

inline std::string AppDataDir() {
    std::string appData = GetEnvUtf8("APPDATA");
    if (appData.empty()) appData = GetEnvUtf8("LOCALAPPDATA");
    if (appData.empty()) appData = HomeDir();
    return appData;
}

inline std::string DesktopDir() {
    std::string desktop = GetEnvUtf8("USERPROFILE");
    if (desktop.empty()) return HomeDir();
    fs::path p = fs::path(Utf8ToWide(desktop)) / L"Desktop";
    return WideToUtf8(p.wstring());
}

inline std::string PathToUtf8(const fs::path& path) {
    return WideToUtf8(path.wstring());
}

inline fs::path PathFromUtf8(const std::string& path) {
    return fs::path(Utf8ToWide(path));
}

inline bool EnsureDirectory(const fs::path& path) {
    DWORD attributes = GetFileAttributesW(path.c_str());
    if (attributes != INVALID_FILE_ATTRIBUTES) {
        return (attributes & FILE_ATTRIBUTE_DIRECTORY) != 0;
    }

    std::error_code ec;
    if (fs::create_directories(path, ec) && !ec) return true;

    fs::path current;
    for (const auto& part : path) {
        current /= part;
        if (current.empty()) continue;
        CreateDirectoryW(current.c_str(), nullptr);
    }
    attributes = GetFileAttributesW(path.c_str());
    return attributes != INVALID_FILE_ATTRIBUTES && (attributes & FILE_ATTRIBUTE_DIRECTORY);
}

inline std::string ReadFileUtf8(const fs::path& path) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ,
                              FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                              nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return {};

    LARGE_INTEGER size{};
    if (!GetFileSizeEx(file, &size) || size.QuadPart <= 0) {
        CloseHandle(file);
        return {};
    }
    std::string content(static_cast<size_t>(size.QuadPart), '\0');
    size_t total = 0;
    while (total < content.size()) {
        DWORD read = 0;
        DWORD chunk = static_cast<DWORD>(std::min<size_t>(content.size() - total, 1 << 20));
        if (!ReadFile(file, content.data() + total, chunk, &read, nullptr) || read == 0) break;
        total += read;
    }
    CloseHandle(file);
    content.resize(total);
    return content;
}

inline bool WriteFileUtf8(const fs::path& path, const std::string& content) {
    if (path.has_parent_path()) EnsureDirectory(path.parent_path());
    HANDLE file = CreateFileW(path.c_str(), GENERIC_WRITE, 0, nullptr,
                              CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return false;

    size_t total = 0;
    while (total < content.size()) {
        DWORD written = 0;
        DWORD chunk = static_cast<DWORD>(std::min<size_t>(content.size() - total, 1 << 20));
        if (!WriteFile(file, content.data() + total, chunk, &written, nullptr) || written == 0) {
            CloseHandle(file);
            return false;
        }
        total += written;
    }
    CloseHandle(file);
    return true;
}

inline bool WriteFileAtomic(const fs::path& path, const std::string& content) {
    if (path.has_parent_path()) EnsureDirectory(path.parent_path());
    fs::path temp = path;
    temp += L".tmp";
    if (!WriteFileUtf8(temp, content)) return false;

    if (MoveFileExW(temp.c_str(), path.c_str(),
                    MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH)) {
        return true;
    }
    DeleteFileW(path.c_str());
    bool result = MoveFileExW(temp.c_str(), path.c_str(),
                              MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH) != 0;
    if (!result) DeleteFileW(temp.c_str());
    return result;
}

inline std::string TimestampForFile() {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
    localtime_s(&tm, &t);
    char buffer[32];
    std::strftime(buffer, sizeof(buffer), "%Y%m%d-%H%M%S", &tm);
    return buffer;
}

inline std::string IsoNow() {
    auto now = std::chrono::system_clock::now();
    std::time_t t = std::chrono::system_clock::to_time_t(now);
    std::tm tm{};
    localtime_s(&tm, &t);
    char buffer[32];
    std::strftime(buffer, sizeof(buffer), "%Y-%m-%dT%H:%M:%S", &tm);
    return buffer;
}

inline std::string RandomId() {
    static std::mutex mutex;
    static std::mt19937_64 rng(static_cast<uint64_t>(
        std::chrono::high_resolution_clock::now().time_since_epoch().count()));
    std::lock_guard<std::mutex> lock(mutex);
    uint64_t value = rng();
    std::ostringstream ss;
    ss << std::hex << std::setw(16) << std::setfill('0') << value;
    return ss.str();
}

inline std::string GetGitHubLoginFromEmail(const std::string& email) {
    static const std::regex pattern(R"(^(?:\d+\+)?([^@]+)@users\.noreply\.github\.com$)",
                                    std::regex::icase);
    std::smatch match;
    if (std::regex_match(email, match, pattern) && match.size() > 1) return match[1].str();
    return {};
}

inline std::string JsonDump(const json& value) {
    return value.dump(-1, ' ', false, json::error_handler_t::replace);
}

inline std::string Base64Encode(const std::vector<unsigned char>& data) {
    static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    std::string out;
    int val = 0;
    int valb = -6;
    for (unsigned char c : data) {
        val = (val << 8) + c;
        valb += 8;
        while (valb >= 0) {
            out.push_back(table[(val >> valb) & 0x3F]);
            valb -= 6;
        }
    }
    if (valb > -6) out.push_back(table[((val << 8) >> (valb + 8)) & 0x3F]);
    while (out.size() % 4) out.push_back('=');
    return out;
}

// ------------------------------------------------------------
// Process execution
// ------------------------------------------------------------

struct ProcessResult {
    int exitCode = -1;
    bool timedOut = false;
    bool launched = false;
    std::string output;
    std::wstring error;
};

inline std::wstring QuoteArg(const std::wstring& arg) {
    if (arg.empty()) return L"\"\"";
    bool needQuotes = arg.find_first_of(L" \t\n\v\"") != std::wstring::npos;
    if (!needQuotes) return arg;

    std::wstring result;
    result.push_back(L'"');
    size_t backslashes = 0;
    for (wchar_t c : arg) {
        if (c == L'\\') {
            ++backslashes;
        } else if (c == L'"') {
            result.append(backslashes * 2 + 1, L'\\');
            result.push_back(L'"');
            backslashes = 0;
        } else {
            result.append(backslashes, L'\\');
            backslashes = 0;
            result.push_back(c);
        }
    }
    result.append(backslashes * 2, L'\\');
    result.push_back(L'"');
    return result;
}

inline std::wstring BuildCommandLine(const std::wstring& exe, const std::vector<std::wstring>& args) {
    std::wstring line = QuoteArg(exe);
    for (const auto& arg : args) {
        line.push_back(L' ');
        line += QuoteArg(arg);
    }
    return line;
}

inline std::wstring BuildEnvironmentBlock(
    const std::vector<std::pair<std::wstring, std::wstring>>& overrides) {
    std::vector<std::pair<std::wstring, std::wstring>> values;
    LPWCH block = GetEnvironmentStringsW();
    if (block) {
        for (LPWCH p = block; *p; p += wcslen(p) + 1) {
            std::wstring entry(p);
            size_t eq = entry.find(L'=');
            if (eq == std::wstring::npos) continue;
            values.emplace_back(entry.substr(0, eq), entry.substr(eq + 1));
        }
        FreeEnvironmentStringsW(block);
    }

    for (const auto& [key, value] : overrides) {
        bool replaced = false;
        for (auto& [existingKey, existingValue] : values) {
            if (_wcsicmp(existingKey.c_str(), key.c_str()) == 0) {
                existingValue = value;
                replaced = true;
                break;
            }
        }
        if (!replaced) values.emplace_back(key, value);
    }

    std::sort(values.begin(), values.end(), [](const auto& a, const auto& b) {
        return _wcsicmp(a.first.c_str(), b.first.c_str()) < 0;
    });

    std::wstring blockOut;
    for (const auto& [key, value] : values) {
        blockOut += key;
        blockOut.push_back(L'=');
        blockOut += value;
        blockOut.push_back(L'\0');
    }
    blockOut.push_back(L'\0');
    return blockOut;
}

inline ProcessResult RunProcess(
    const std::wstring& exe,
    const std::vector<std::wstring>& args,
    const std::wstring& cwd,
    const std::vector<std::pair<std::wstring, std::wstring>>& env = {},
    int timeoutMs = 180000) {

    ProcessResult result;
    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;
    sa.lpSecurityDescriptor = nullptr;

    HANDLE readPipe = nullptr;
    HANDLE writePipe = nullptr;
    if (!CreatePipe(&readPipe, &writePipe, &sa, 0)) {
        result.error = L"CreatePipe failed";
        return result;
    }
    SetHandleInformation(readPipe, HANDLE_FLAG_INHERIT, 0);

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESTDHANDLES | STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    si.hStdOutput = writePipe;
    si.hStdError = writePipe;
    si.hStdInput = GetStdHandle(STD_INPUT_HANDLE);

    PROCESS_INFORMATION pi{};
    std::wstring commandLine = BuildCommandLine(exe, args);
    std::wstring envBlock = BuildEnvironmentBlock(env);
    std::wstring cwdValue = cwd;
    DWORD flags = CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT;

    BOOL created = CreateProcessW(
        nullptr,
        commandLine.data(),
        nullptr,
        nullptr,
        TRUE,
        flags,
        envBlock.data(),
        cwdValue.empty() ? nullptr : cwdValue.c_str(),
        &si,
        &pi);
    CloseHandle(writePipe);
    if (!created) {
        CloseHandle(readPipe);
        result.error = L"CreateProcess failed: " + std::to_wstring(GetLastError());
        return result;
    }
    result.launched = true;

    std::thread reader([&]() {
        char buffer[8192];
        DWORD read = 0;
        while (ReadFile(readPipe, buffer, sizeof(buffer), &read, nullptr) && read > 0) {
            result.output.append(buffer, read);
        }
    });

    DWORD wait = WaitForSingleObject(pi.hProcess, static_cast<DWORD>(timeoutMs));
    if (wait == WAIT_TIMEOUT) {
        result.timedOut = true;
        TerminateProcess(pi.hProcess, 124);
        WaitForSingleObject(pi.hProcess, 3000);
    }
    DWORD exitCode = 0;
    GetExitCodeProcess(pi.hProcess, &exitCode);
    result.exitCode = static_cast<int>(exitCode);

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    // Closing the read handle unblocks the reader if the child left handles open.
    CancelSynchronousIo(reinterpret_cast<HANDLE>(static_cast<uintptr_t>(reader.native_handle())));
    CloseHandle(readPipe);
    if (reader.joinable()) reader.join();
    return result;
}

inline ProcessResult RunProcess(
    const std::wstring& exe,
    const std::vector<std::wstring>& args,
    const std::wstring& cwd = L"",
    int timeoutMs = 180000) {
    return RunProcess(exe, args, cwd, {}, timeoutMs);
}

}  // namespace gs
