#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif

#include <winsock2.h>
#include <ws2tcpip.h>
#include <windows.h>
#include <shellapi.h>

#include <cstdio>
#include <cwchar>
#include <filesystem>
#include <string>
#include <vector>

namespace fs = std::filesystem;

namespace {

constexpr wchar_t kAppTitle[] = L"Git\u7ba1\u7406\u5668";

fs::path ExecutableDir() {
    wchar_t buf[MAX_PATH] = {};
    DWORD len = GetModuleFileNameW(nullptr, buf, MAX_PATH);
    if (len == 0) return fs::current_path();
    return fs::path(buf).parent_path();
}

bool Exists(const fs::path& p) {
    std::error_code ec;
    return fs::exists(p, ec);
}

std::string WideToUtf8(const std::wstring& value) {
    if (value.empty()) return {};
    int size = WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
                                   nullptr, 0, nullptr, nullptr);
    if (size <= 0) return {};
    std::string out(static_cast<size_t>(size), '\0');
    WideCharToMultiByte(CP_UTF8, 0, value.data(), static_cast<int>(value.size()),
                        out.data(), size, nullptr, nullptr);
    return out;
}

std::string ReadFileText(const fs::path& path) {
    HANDLE file = CreateFileW(path.c_str(), GENERIC_READ,
                              FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
                              nullptr, OPEN_EXISTING, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (file == INVALID_HANDLE_VALUE) return {};
    DWORD size = GetFileSize(file, nullptr);
    if (size == INVALID_FILE_SIZE || size == 0) {
        CloseHandle(file);
        return {};
    }
    std::string data(size, '\0');
    DWORD read = 0;
    BOOL ok = ReadFile(file, data.data(), size, &read, nullptr);
    CloseHandle(file);
    if (!ok) return {};
    data.resize(read);
    return data;
}

void LogNative(const fs::path& dataDir, const std::string& message) {
    try {
        fs::path logDir = dataDir / L"logs";
        std::error_code ec;
        fs::create_directories(logDir, ec);
        fs::path path = logDir / L"launcher-native.log";
        HANDLE file = CreateFileW(path.c_str(), FILE_APPEND_DATA, FILE_SHARE_READ,
                                  nullptr, OPEN_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
        if (file == INVALID_HANDLE_VALUE) return;
        SYSTEMTIME st{};
        GetLocalTime(&st);
        char prefix[64];
        std::snprintf(prefix, sizeof(prefix), "%04d-%02d-%02d %02d:%02d:%02d  ",
                      st.wYear, st.wMonth, st.wDay, st.wHour, st.wMinute, st.wSecond);
        std::string line = std::string(prefix) + message + "\r\n";
        DWORD written = 0;
        WriteFile(file, line.data(), static_cast<DWORD>(line.size()), &written, nullptr);
        CloseHandle(file);
    } catch (...) {
    }
}

int JsonInt(const std::string& text, const std::string& key) {
    std::string needle = "\"" + key + "\"";
    size_t pos = text.find(needle);
    if (pos == std::string::npos) return 0;
    pos = text.find(':', pos + needle.size());
    if (pos == std::string::npos) return 0;
    ++pos;
    while (pos < text.size() && (text[pos] == ' ' || text[pos] == '\t')) ++pos;
    long long value = 0;
    bool digits = false;
    while (pos < text.size() && text[pos] >= '0' && text[pos] <= '9') {
        value = value * 10 + (text[pos] - '0');
        ++pos;
        digits = true;
    }
    return digits ? static_cast<int>(value) : 0;
}

bool PortOpen(int port) {
    if (port <= 0) return false;
    SOCKET sock = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
    if (sock == INVALID_SOCKET) return false;
    sockaddr_in addr{};
    addr.sin_family = AF_INET;
    addr.sin_port = htons(static_cast<u_short>(port));
    addr.sin_addr.s_addr = inet_addr("127.0.0.1");
    bool open = connect(sock, reinterpret_cast<sockaddr*>(&addr), sizeof(addr)) == 0;
    closesocket(sock);
    return open;
}

void StopStaleCore(int pid, const fs::path& expectedCore) {
    if (pid <= 0) return;
    HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE,
                                 FALSE, static_cast<DWORD>(pid));
    if (!process) return;
    wchar_t path[MAX_PATH] = {};
    DWORD size = MAX_PATH;
    if (QueryFullProcessImageNameW(process, 0, path, &size)) {
        if (_wcsicmp(path, expectedCore.c_str()) == 0) {
            TerminateProcess(process, 0);
            WaitForSingleObject(process, 2000);
        }
    }
    CloseHandle(process);
}

bool StartCore(const fs::path& dir, const fs::path& core, const fs::path& web,
               const fs::path& logDir) {
    std::error_code ec;
    fs::create_directories(logDir, ec);

    SECURITY_ATTRIBUTES sa{};
    sa.nLength = sizeof(sa);
    sa.bInheritHandle = TRUE;
    HANDLE stdoutFile = CreateFileW((logDir / L"server.out.log").c_str(), GENERIC_WRITE,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, CREATE_ALWAYS,
                                    FILE_ATTRIBUTE_NORMAL, nullptr);
    HANDLE stderrFile = CreateFileW((logDir / L"server.err.log").c_str(), GENERIC_WRITE,
                                    FILE_SHARE_READ | FILE_SHARE_WRITE, &sa, CREATE_ALWAYS,
                                    FILE_ATTRIBUTE_NORMAL, nullptr);

    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    bool redirect = stdoutFile != INVALID_HANDLE_VALUE && stderrFile != INVALID_HANDLE_VALUE;
    if (redirect) {
        si.dwFlags |= STARTF_USESTDHANDLES;
        si.hStdOutput = stdoutFile;
        si.hStdError = stderrFile;
    }

    std::wstring command = L"\"" + core.wstring() + L"\" --serve --no-open --web-root \"" +
                           web.wstring() + L"\"";
    PROCESS_INFORMATION pi{};
    BOOL created = CreateProcessW(nullptr, command.data(), nullptr, nullptr, redirect,
                                  CREATE_NO_WINDOW | CREATE_UNICODE_ENVIRONMENT,
                                  nullptr, dir.c_str(), &si, &pi);
    if (stdoutFile != INVALID_HANDLE_VALUE) CloseHandle(stdoutFile);
    if (stderrFile != INVALID_HANDLE_VALUE) CloseHandle(stderrFile);
    if (!created) return false;
    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return true;
}

int WaitForServer(const fs::path& runtimePath, int timeoutMs) {
    int waited = 0;
    while (waited < timeoutMs) {
        std::string text = ReadFileText(runtimePath);
        int port = JsonInt(text, "port");
        if (port > 0 && PortOpen(port)) return port;
        Sleep(100);
        waited += 100;
    }
    return 0;
}

bool FocusExistingApp() {
    HWND window = FindWindowW(nullptr, kAppTitle);
    if (!window) return false;
    if (IsIconic(window)) ShowWindow(window, SW_RESTORE);
    ShowWindow(window, SW_SHOW);
    SetForegroundWindow(window);
    BringWindowToTop(window);
    return true;
}

}  // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    WSADATA wsa{};
    WSAStartup(MAKEWORD(2, 2), &wsa);

    fs::path dir = ExecutableDir();
    fs::path core;
    fs::path web;
    fs::path data;

    if (Exists(dir / L"gitcore.exe") && Exists(dir / L"web" / L"index.html")) {
        core = dir / L"gitcore.exe";
        web = dir / L"web";
        data = dir / L"data";
    } else if (Exists(dir / L"core" / L"build" / L"gitcore.exe") &&
               Exists(dir / L"app" / L"out" / L"renderer" / L"index.html")) {
        core = dir / L"core" / L"build" / L"gitcore.exe";
        web = dir / L"app" / L"out" / L"renderer";
        data = dir / L"core" / L"build" / L"data";
    } else if (Exists(dir / L"dist" / L"gitcore.exe") && Exists(dir / L"dist" / L"web" / L"index.html")) {
        core = dir / L"dist" / L"gitcore.exe";
        web = dir / L"dist" / L"web";
        data = dir / L"dist" / L"data";
    } else {
        MessageBoxW(nullptr, L"找不到 gitcore.exe 或 web\\index.html，请先运行构建脚本。",
                    kAppTitle, MB_OK | MB_ICONERROR);
        WSACleanup();
        return 1;
    }

    std::error_code ec;
    fs::create_directories(data, ec);
    fs::path logDir = data / L"logs";
    fs::create_directories(logDir, ec);
    SetEnvironmentVariableW(L"GIT_SWITCHER_V2_DATA", data.c_str());
    LogNative(data, "launcher start, core=" + WideToUtf8(core.wstring()));

    fs::path runtimePath = data / L"runtime.json";
    int port = 0;
    {
        std::string runtime = ReadFileText(runtimePath);
        port = JsonInt(runtime, "port");
        int pid = JsonInt(runtime, "pid");
        if (port > 0 && !PortOpen(port)) {
            LogNative(data, "stale runtime port=" + std::to_string(port) +
                                " pid=" + std::to_string(pid));
            StopStaleCore(pid, core);
            DeleteFileW(runtimePath.c_str());
            port = 0;
        }
    }

    if (port <= 0 || !PortOpen(port)) {
        if (!StartCore(dir, core, web, logDir)) {
            MessageBoxW(nullptr, L"无法启动 gitcore.exe。", kAppTitle, MB_OK | MB_ICONERROR);
            WSACleanup();
            return 1;
        }
        port = WaitForServer(runtimePath, 15000);
    }

    if (port <= 0) {
        MessageBoxW(nullptr,
                    L"C++ 核心启动失败。\n请查看 data\\logs\\core.log 和 data\\logs\\server.err.log。",
                    kAppTitle, MB_OK | MB_ICONERROR);
        WSACleanup();
        return 1;
    }

    std::wstring url = L"http://127.0.0.1:" + std::to_wstring(port) + L"/";
    LogNative(data, "server ready port=" + std::to_string(port));

    if (FocusExistingApp()) {
        LogNative(data, "existing app window focused");
        WSACleanup();
        return 0;
    }

    LogNative(data, "opening default browser");
    // Open the URL through the shell's registered browser handler. Do NOT
    // start explorer.exe here: spawning a second Explorer can fail with
    // 0xc0000142 on this machine and leaves a blocking error dialog.
    HINSTANCE openResult = ShellExecuteW(nullptr, L"open", url.c_str(), nullptr, nullptr,
                                         SW_SHOWNORMAL);
    bool opened = reinterpret_cast<INT_PTR>(openResult) > 32;
    if (!opened) {
        LogNative(data, "ShellExecute URL failed, trying rundll32");
        std::wstring command = L"rundll32.exe url.dll,FileProtocolHandler " + url;
        STARTUPINFOW si{};
        si.cb = sizeof(si);
        si.dwFlags = STARTF_USESHOWWINDOW;
        si.wShowWindow = SW_HIDE;
        PROCESS_INFORMATION pi{};
        opened = CreateProcessW(nullptr, command.data(), nullptr, nullptr, FALSE,
                                CREATE_NO_WINDOW, nullptr, nullptr, &si, &pi) != FALSE;
        if (opened) {
            CloseHandle(pi.hThread);
            CloseHandle(pi.hProcess);
        }
    }
    LogNative(data, opened ? "default browser open requested"
                           : "default browser open failed");

    // Chrome may create the tab in the background. Bring the app window to the
    // foreground once its title appears so double-click visibly opens the UI.
    bool focused = false;
    for (int i = 0; i < 50; ++i) {
        Sleep(200);
        HWND window = FindWindowW(nullptr, kAppTitle);
        if (window) {
            if (IsIconic(window)) ShowWindow(window, SW_RESTORE);
            ShowWindow(window, SW_SHOW);
            SetForegroundWindow(window);
            BringWindowToTop(window);
            focused = true;
            break;
        }
    }
    LogNative(data, focused ? "app window focused"
                            : "url opened, app window not detected yet");
    WSACleanup();
    return 0;
}
