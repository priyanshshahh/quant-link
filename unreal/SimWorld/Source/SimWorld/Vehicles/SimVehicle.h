// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "WheeledVehiclePawn.h"
#include "Interfaces/SimInteractable.h"
#include "SimVehicle.generated.h"

class UWidgetComponent;

/**
 * Base purchasable / drivable vehicle built on Chaos Vehicles.
 *
 * Interaction contract (ISimInteractable):
 *  - If bIsOwnedByPlayer == false  -> attempt PURCHASE via the instigator's
 *    USimEconomyComponent. On success, flips ownership and refreshes the badge.
 *  - If bIsOwnedByPlayer == true   -> POSSESS the vehicle (routes through the
 *    ASimPlayerController so the player can later return to their character).
 *
 * A UWidgetComponent renders the diegetic name/price badge above the car.
 */
UCLASS(Abstract, Blueprintable)
class SIMWORLD_API ASimVehicle : public AWheeledVehiclePawn, public ISimInteractable
{
	GENERATED_BODY()

public:
	ASimVehicle();

	// --- ISimInteractable ---
	virtual void Interact_Implementation(AActor* Instigator) override;
	virtual FText GetInteractPrompt_Implementation() const override;

	UFUNCTION(BlueprintPure, Category = "SimWorld|Vehicle")
	bool IsOwnedByPlayer() const { return bIsOwnedByPlayer; }

protected:
	virtual void BeginPlay() override;

	/** Floating widget showing name + price. Assign a WBP in the Blueprint. */
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SimWorld|Vehicle")
	TObjectPtr<UWidgetComponent> InfoWidget;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Vehicle")
	FText VehicleName = FText::FromString(TEXT("Sports Coupe"));

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Vehicle")
	float Price = 25000.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, SaveGame, Category = "SimWorld|Vehicle")
	bool bIsOwnedByPlayer = false;

	/** Implement in BP to refresh the floating badge text after a purchase. */
	UFUNCTION(BlueprintImplementableEvent, Category = "SimWorld|Vehicle")
	void OnVehicleStateChanged();

private:
	/** Resolves the economy wallet from the interacting pawn's PlayerState. */
	class USimEconomyComponent* ResolveEconomy(AActor* Instigator) const;
};
