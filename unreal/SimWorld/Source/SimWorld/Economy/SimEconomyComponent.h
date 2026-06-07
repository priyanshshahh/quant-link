// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "Components/ActorComponent.h"
#include "SimEconomyComponent.generated.h"

/**
 * Broadcast whenever the balance changes. The HUD binds to this so it can
 * update instantly WITHOUT casting to the component's owner.
 * Param: NewBalance — the post-transaction balance.
 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_OneParam(FOnBalanceChanged, float, NewBalance);

/**
 * Attach to the APlayerState (or any actor) to give it a wallet.
 * Handles balance math, affordability checks, change notifications, and
 * USaveGame persistence.
 *
 * SpacetimeDB hook: AddMoney/RemoveMoney are the single choke points for all
 * wealth changes. Mirror them to the server by calling your generated
 * `execute_trade` / `buy_vehicle` reducers here (see README "SpacetimeDB Sync").
 */
UCLASS(ClassGroup = (SimWorld), meta = (BlueprintSpawnableComponent))
class SIMWORLD_API USimEconomyComponent : public UActorComponent
{
	GENERATED_BODY()

public:
	USimEconomyComponent();

	/** Fired after any successful balance mutation. */
	UPROPERTY(BlueprintAssignable, Category = "SimWorld|Economy")
	FOnBalanceChanged OnBalanceChanged;

	/** Adds money and notifies listeners. Negative amounts are ignored. */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|Economy")
	void AddMoney(float Amount);

	/**
	 * Removes money if affordable. Returns true on success, false if the player
	 * cannot afford it (balance is left untouched on failure).
	 */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|Economy")
	bool RemoveMoney(float Amount);

	/** True if the current balance is >= Amount. */
	UFUNCTION(BlueprintPure, Category = "SimWorld|Economy")
	bool CanAfford(float Amount) const;

	/** Read the current balance. */
	UFUNCTION(BlueprintPure, Category = "SimWorld|Economy")
	float GetBalance() const { return CurrentBalance; }

	/** Persist the current balance to the USaveGame slot. */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|Economy|Save")
	void SaveWealth();

	/** Load balance from the USaveGame slot (falls back to StartingBalance). */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|Economy|Save")
	void LoadWealth();

protected:
	virtual void BeginPlay() override;

	/** Authoritative balance. Edited via AddMoney/RemoveMoney only. */
	UPROPERTY(EditAnywhere, BlueprintReadOnly, Category = "SimWorld|Economy")
	float CurrentBalance = 0.0f;

	/** Used the first time a profile is created (no save present). */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Economy")
	float StartingBalance = 100000.0f;

	/** Save slot identifiers. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Economy|Save")
	FString SaveSlotName = TEXT("SimWorldProfile");

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Economy|Save")
	int32 UserIndex = 0;

	/** Auto-load wealth on BeginPlay if a save exists. */
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Economy|Save")
	bool bAutoLoadOnBeginPlay = true;
};
