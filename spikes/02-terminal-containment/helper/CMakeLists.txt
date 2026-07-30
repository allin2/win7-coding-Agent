# SPIKE 02 - C++ Helper CMake 构建配置
#
# 编译要求：MSVC v142 (Visual Studio 2019)
# 目标平台：Windows 7 SP1 x64
#
# 用法：
#   mkdir build && cd build
#   cmake .. -G "Visual Studio 16 2019" -A x64
#   cmake --build . --config Release
#
# Win7-Validation: NOT_PERFORMED

cmake_minimum_required(VERSION 3.15)
project(spike02_helper LANGUAGES CXX)

# ─── 编译配置 ────────────────────────────────────────────────────────────────

# C++17 标准
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# MSVC v142 工具集（Visual Studio 2019）
# 注意：通过 -T v142 参数指定，或在 VS IDE 中选择

# Win7 兼容性：定义 _WIN32_WINNT=0x0601 (Windows 7)
add_definitions(-D_WIN32_WINNT=0x0601)
add_definitions(-DWINVER=0x0601)

# Unicode 支持（中文路径 C10）
add_definitions(-DUNICODE -D_UNICODE)

# ─── 目标定义 ────────────────────────────────────────────────────────────────

add_executable(helper
    helper.cpp
    helper.h
)

# 链接库
target_link_libraries(helper
    advapi32    # ACL / Token API
    aclui       # ACL UI（可选）
)

# ─── 编译选项 ────────────────────────────────────────────────────────────────

if(MSVC)
    # 警告级别
    target_compile_options(helper PRIVATE /W4)
    
    # 优化选项（Release）
    target_compile_options(helper PRIVATE
        $<$<CONFIG:Release>:/O2>
        $<$<CONFIG:Release>:/GL>    # 全程序优化
    )
    
    # 链接选项（Release）
    target_link_options(helper PRIVATE
        $<$<CONFIG:Release>:/LTCG>  # 链接时代码生成
        $<$<CONFIG:Release>:/OPT:REF>
        $<$<CONFIG:Release>:/OPT:ICF>
    )
    
    # 运行时库
    target_compile_options(helper PRIVATE
        $<$<CONFIG:Debug>:/MTd>
        $<$<CONFIG:Release>:/MT>    # 静态链接 CRT
    )
endif()

# ─── 安装 ────────────────────────────────────────────────────────────────────

install(TARGETS helper RUNTIME DESTINATION bin)
