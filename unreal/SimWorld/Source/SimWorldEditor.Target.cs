// Copyright QuantLink. Epic Games C++ Coding Standard.

using UnrealBuildTool;
using System.Collections.Generic;

public class SimWorldEditorTarget : TargetRules
{
	public SimWorldEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;
		ExtraModuleNames.Add("SimWorld");
	}
}
