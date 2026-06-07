// Copyright QuantLink. Epic Games C++ Coding Standard.

using UnrealBuildTool;
using System.Collections.Generic;

public class SimWorldTarget : TargetRules
{
	public SimWorldTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SimWorld");
	}
}
