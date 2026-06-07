// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "UObject/Interface.h"
#include "SimInteractable.generated.h"

/**
 * UInterface boilerplate. Do not add members here — implement everything on the
 * ISimInteractable companion below. Marked Blueprintable so designers can also
 * implement the interface directly on Blueprint actors.
 */
UINTERFACE(MinimalAPI, Blueprintable)
class USimInteractable : public UInterface
{
	GENERATED_BODY()
};

/**
 * Contract for anything the player can interact with in the world:
 * vehicles, NPCs, real-estate doors, ATMs, etc.
 *
 * Both functions are BlueprintNativeEvent, meaning:
 *  - C++ classes override the *_Implementation variant.
 *  - Blueprint classes can override the event node directly.
 *  - Callers invoke the bare Execute_Interact / Execute_GetInteractPrompt
 *    static dispatchers so it works regardless of where it's implemented.
 */
class ISimInteractable
{
	GENERATED_BODY()

public:
	/**
	 * Perform the interaction. The Instigator is the actor that triggered it
	 * (normally the player character or its controller).
	 */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "SimWorld|Interaction")
	void Interact(AActor* Instigator);

	/**
	 * Returns the diegetic prompt to show on the HUD when the player is looking
	 * at this object, e.g. "Press E to Buy  $500,000".
	 */
	UFUNCTION(BlueprintNativeEvent, BlueprintCallable, Category = "SimWorld|Interaction")
	FText GetInteractPrompt() const;
};
