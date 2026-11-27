#ifndef UNICODE
#define UNICODE
#endif
#ifndef _UNICODE
#define _UNICODE
#endif

#include <windows.h>

#include <filesystem>
#include <string>

namespace fs = std::filesystem;

namespace {

fs::path ExecutableDir() {
    wchar_t buf[MAX_PATH] = {};
    DWORD len = GetModuleFileNameW(nullptr, buf, MAX_PATH);
    if (len == 0) return fs::current_path();
    return fs::path(buf).parent_path();
}

std::wstring QuoteArg(const std::wstring& value) {
    if (value.find_first_of(L" \t\"") == std::wstring::npos) return value;
    std::wstring out = L"\"";
    for (wchar_t ch : value) {
        if (ch == L'"') out += L"\\\"";
        else out += ch;
    }
    out += L'"';
    return out;
}

bool Exists(const fs::path& p) {
    std::error_code ec;
    return fs::exists(p, ec);
}

}  // namespace

int WINAPI WinMain(HINSTANCE, HINSTANCE, LPSTR, int) {
    fs::path dir = ExecutableDir();

    fs::path core;
    fs::path web;
    fs::path data;

    if (Exists(dir / L"gitcore.exe") && Exists(dir / L"web" / L"index.html")) {
        core = dir / L"gitcore.exe";
        web = dir / L"web";
        data = dir / L"data";
    } else if (Exists(dir / L"gitcore.exe") && Exists(dir / L".." / L".." / L"app" / L"out" / L"renderer" / L"index.html")) {
        core = dir / L"gitcore.exe";
        web = dir / L".." / L".." / L"app" / L"out" / L"renderer";
        data = dir / L"data";
    } else if (Exists(dir / L"core" / L"build" / L"gitcore.exe") && Exists(dir / L"app" / L"out" / L"renderer" / L"index.html")) {
        core = dir / L"core" / L"build" / L"gitcore.exe";
        web = dir / L"app" / L"out" / L"renderer";
        data = dir / L"core" / L"build" / L"data";
    } else if (Exists(dir / L"dist" / L"gitcore.exe") && Exists(dir / L"dist" / L"web" / L"index.html")) {
        core = dir / L"dist" / L"gitcore.exe";
        web = dir / L"dist" / L"web";
        data = dir / L"dist" / L"data";
    } else {
        MessageBoxW(nullptr, L"找不到 gitcore.exe 或 web\\index.html，请先运行构建脚本。", L"Git管理器", MB_OK | MB_ICONERROR);
        return 1;
    }

    std::error_code ec;
    fs::create_directories(data, ec);
    SetEnvironmentVariableW(L"GIT_SWITCHER_V2_DATA", data.c_str());

    std::wstring cmd = QuoteArg(core.wstring()) + L" --serve --open --web-root " + QuoteArg(web.wstring());
    STARTUPINFOW si{};
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW;
    si.wShowWindow = SW_HIDE;
    PROCESS_INFORMATION pi{};

    if (!CreateProcessW(
            core.c_str(),
            cmd.data(),
            nullptr,
            nullptr,
            FALSE,
            CREATE_NO_WINDOW,
            nullptr,
            dir.c_str(),
            &si,
            &pi)) {
        MessageBoxW(nullptr, L"无法启动 gitcore.exe。", L"Git管理器", MB_OK | MB_ICONERROR);
        return 1;
    }

    CloseHandle(pi.hThread);
    CloseHandle(pi.hProcess);
    return 0;
}
