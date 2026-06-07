// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/SaveGame.h"
#include "SimSaveGame.generated.h"

/**
 * Persistent wealth payload written/read by USimEconomyComponent through
 * UGameplayStatics::SaveGameToSlot / LoadGameFromSlot.
 */
UCLASS()
class SIMWORLD_API USimSaveGame : public USaveGame
{
	GENERATED_BODY()

public:
	/** The player's last-known balance. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SimWorld|Save")
	float SavedBalance = 0.0f;

	/** Slot metadata so we can support multiple profiles later. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SimWorld|Save")
	FString SaveSlotName = TEXT("SimWorldProfile");

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SimWorld|Save")
	int32 UserIndex = 0;
};
