# SPIKE 02 / D-013 — C++ Helper CMake build configuration.
#
# Targets:
#   helper        Win32 containment executable (MSVC v142 / MinGW cross-check)
#   logic_tests   platform-neutral unit tests for JSON protocol, argv quoting
#                 and the allow-list (buildable and runnable on macOS/Linux)
#
# Windows build (D-017 profile):
#   cmake .. -G "Visual Studio 16 2019" -A x64 -T v142
#   cmake --build . --config Release
#
# Target platform: Windows 7 SP1 x64.
# Win7-Validation: NOT_PERFORMED

cmake_minimum_required(VERSION 3.15)
project(spike02_helper LANGUAGES CXX)

# C++17
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Win7 compatibility + Unicode (C10/C11).
add_definitions(-D_WIN32_WINNT=0x0601)
add_definitions(-DWINVER=0x0601)
add_definitions(-DUNICODE -D_UNICODE)

# ─── Shared platform-neutral logic ────────────────────────────────────────────

set(HELPER_LOGIC_SOURCES
    json_parser.cpp
    argv_builder.cpp
    whitelist.cpp
    protocol.cpp
)

add_library(helper_logic STATIC ${HELPER_LOGIC_SOURCES})
target_include_directories(helper_logic PUBLIC ${CMAKE_CURRENT_SOURCE_DIR})

# ─── Win32 helper executable ─────────────────────────────────────────────────

if(WIN32)
    add_executable(helper
        helper.cpp
        ${HELPER_LOGIC_SOURCES}
    )
    target_include_directories(helper PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})

    target_link_libraries(helper PRIVATE advapi32)

    if(MSVC)
        target_compile_options(helper PRIVATE /W4)
        target_compile_options(helper PRIVATE
            $<$<CONFIG:Release>:/O2>
            $<$<CONFIG:Release>:/GL>
        )
        target_link_options(helper PRIVATE
            $<$<CONFIG:Release>:/LTCG>
            $<$<CONFIG:Release>:/OPT:REF>
            $<$<CONFIG:Release>:/OPT:ICF>
        )
        # Static CRT: the D-013 return package must carry no dynamic
        # VCRUNTIME140/MSVCP140/UCRTBASE dependencies (PE/API/CRT gate).
        target_compile_options(helper PRIVATE
            $<$<CONFIG:Debug>:/MTd>
            $<$<CONFIG:Release>:/MT>
        )
    elseif(MINGW)
        # wmain entry point.
        target_link_options(helper PRIVATE -municode)
        target_compile_options(helper PRIVATE -Wall -Wextra)
    endif()

    install(TARGETS helper RUNTIME DESTINATION bin)
else()
    # On non-Windows hosts only the logic tests are meaningful.
    message(STATUS "Non-Windows host: building logic_tests only")
endif()

# ─── Platform-neutral logic tests ─────────────────────────────────────────────

option(SPIKE02_BUILD_LOGIC_TESTS "Build platform-neutral logic unit tests" ON)
if(SPIKE02_BUILD_LOGIC_TESTS)
    add_executable(logic_tests
        logic_tests.cpp
        ${HELPER_LOGIC_SOURCES}
    )
    target_include_directories(logic_tests PRIVATE ${CMAKE_CURRENT_SOURCE_DIR})
    if(MSVC)
        target_compile_options(logic_tests PRIVATE /W4)
    endif()
    enable_testing()
    add_test(NAME logic_tests COMMAND logic_tests)
endif()
