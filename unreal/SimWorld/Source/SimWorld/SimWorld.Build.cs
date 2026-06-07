// Copyright QuantLink. Epic Games C++ Coding Standard.

using UnrealBuildTool;

public class SimWorld : ModuleRules
{
	public SimWorld(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		// Public dependencies are exposed to any module that depends on SimWorld.
		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",
			"EnhancedInput",     // Player input (IA_Interact etc.)
			"ChaosVehicles",     // AWheeledVehiclePawn base for ASimVehicle
			"PhysicsCore",
			"UMG",               // UWidgetComponent diegetic UI
			"CommonUI"           // UCommonUserWidget HUD base
		});

		// Private dependencies are only used inside SimWorld.
		PrivateDependencyModuleNames.AddRange(new string[]
		{
			"Slate",
			"SlateCore",
			"GameplayTags"
		});
	}
}
