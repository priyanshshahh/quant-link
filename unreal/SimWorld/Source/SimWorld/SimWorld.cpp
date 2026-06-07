// Copyright QuantLink. Epic Games C++ Coding Standard.

#include "SimWorld.h"
#include "Modules/ModuleManager.h"

// Registers SimWorld as the primary game module. The second argument MUST match
// the module name used in SimWorld.Build.cs and the .uproject "Modules" entry.
IMPLEMENT_PRIMARY_GAME_MODULE(FDefaultGameModuleImpl, SimWorld, "SimWorld");
