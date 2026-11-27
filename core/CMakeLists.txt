cmake_minimum_required(VERSION 3.20)
project(GitAccountSwitcherV2Core LANGUAGES CXX RC)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

add_executable(gitcore
    src/main.cpp
    src/config.cpp
    src/git.cpp
    src/platform.cpp
    src/app.rc
)

target_include_directories(gitcore PRIVATE src)
target_compile_definitions(gitcore PRIVATE UNICODE _UNICODE)
target_link_libraries(gitcore PRIVATE advapi32 winhttp wininet ole32 shell32 user32 ws2_32 comdlg32 uuid gdi32)

if(MINGW)
    target_link_options(gitcore PRIVATE -static -static-libgcc -static-libstdc++)
endif()

if(MSVC)
    target_compile_options(gitcore PRIVATE /W4 /utf-8)
else()
    target_compile_options(gitcore PRIVATE -Wall -Wextra -Wno-unused-parameter)
endif()

set_target_properties(gitcore PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
    OUTPUT_NAME "gitcore"
)

add_executable(launcher WIN32
    src/launcher.cpp
    src/app.rc
)
target_compile_definitions(launcher PRIVATE UNICODE _UNICODE)
target_link_libraries(launcher PRIVATE ws2_32 shell32 advapi32 user32)
if(MINGW)
    target_link_options(launcher PRIVATE -mwindows -static -static-libgcc -static-libstdc++)
endif()
if(MSVC)
    target_compile_options(launcher PRIVATE /W4 /utf-8)
endif()
set_target_properties(launcher PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
    OUTPUT_NAME "launcher"
)
