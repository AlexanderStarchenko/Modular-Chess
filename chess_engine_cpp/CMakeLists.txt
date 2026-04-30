cmake_minimum_required(VERSION 3.10)
project(ChessEngine LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Source files
set(SOURCES
    main.cpp
    src/board.cpp
    src/search.cpp
    src/uci.cpp
)

# Header files (for IDE integration)
set(HEADERS
    include/types.h
    include/board.h
    include/search.h
    include/uci.h
)

add_executable(chess_engine ${SOURCES} ${HEADERS})

target_include_directories(chess_engine PRIVATE ${CMAKE_CURRENT_SOURCE_DIR}/include)

# Optimization for Release builds
if(CMAKE_BUILD_TYPE STREQUAL "Release")
    if(MSVC)
        target_compile_options(chess_engine PRIVATE /O2 /DNDEBUG)
    else()
        target_compile_options(chess_engine PRIVATE -O3 -DNDEBUG)
    endif()
endif()
