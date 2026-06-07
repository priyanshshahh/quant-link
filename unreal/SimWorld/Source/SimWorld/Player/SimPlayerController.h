// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "SimPlayerController.generated.h"

class ASimVehicle;
class ACharacter;

/**
 * Handles the seamless on-foot <-> in-vehicle possession swap.
 * Stores the character pawn so ExitVehicle can return the player to it.
 */
UCLASS()
class SIMWORLD_API ASimPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	/** Possess the given vehicle, remembering the current character. */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|Possession")
	void EnterVehicle(ASimVehicle* Vehicle);

	/** Leave the current vehicle and re-possess the stored character. */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|Possession")
	void ExitVehicle();

	UFUNCTION(BlueprintPure, Category = "SimWorld|Possession")
	bool IsDriving() const { return CurrentVehicle != nullptr; }

protected:
	/** The character to return to when leaving a vehicle. */
	UPROPERTY(Transient)
	TObjectPtr<ACharacter> StoredCharacter;

	/** The vehicle currently being driven (null when on foot). */
	UPROPERTY(Transient)
	TObjectPtr<ASimVehicle> CurrentVehicle;

	/** Where to drop the character when exiting (offset from the vehicle). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Possession")
	FVector ExitOffset = FVector(200.0f, 0.0f, 0.0f);
};
