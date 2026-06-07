// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "CommonUserWidget.h"
#include "SimHUDWidget.generated.h"

class USimEconomyComponent;
class ASimCharacter;
class UTextBlock;

/**
 * Diegetic HUD root (CommonUI).
 *
 * Binds to:
 *  - USimEconomyComponent::OnBalanceChanged  -> updates the money readout and
 *    triggers OnBalancePulse (designer animates a 3s fade-out in Blueprint).
 *  - ASimCharacter::OnFocusedInteractableChanged -> shows/hides the prompt.
 *
 * The C++ here only wires data + events; ALL styling (frosted-glass blur,
 * typography, fade timeline) is authored in the WBP — see README_BLUEPRINTS.md.
 */
UCLASS(Abstract)
class SIMWORLD_API USimHUDWidget : public UCommonUserWidget
{
	GENERATED_BODY()

public:
	/** Subscribe to a wallet. Safe to call after the PlayerState exists. */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|HUD")
	void BindToEconomy(USimEconomyComponent* Economy);

	/** Subscribe to the character's interaction focus events. */
	UFUNCTION(BlueprintCallable, Category = "SimWorld|HUD")
	void BindToCharacter(ASimCharacter* Character);

protected:
	virtual void NativeDestruct() override;

	/**
	 * Money readout. Add a TextBlock named EXACTLY "BalanceText" in the WBP
	 * (BindWidgetOptional => no compile error if you style it differently).
	 */
	UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "SimWorld|HUD")
	TObjectPtr<UTextBlock> BalanceText;

	/** Interaction prompt. Add a TextBlock named EXACTLY "PromptText". */
	UPROPERTY(BlueprintReadOnly, meta = (BindWidgetOptional), Category = "SimWorld|HUD")
	TObjectPtr<UTextBlock> PromptText;

	/**
	 * Designer hook: play your "appear, hold, fade after 3s" animation here.
	 * Called every time the balance changes.
	 */
	UFUNCTION(BlueprintImplementableEvent, Category = "SimWorld|HUD")
	void OnBalancePulse(float NewBalance);

	/** Designer hook: slide/fade the prompt in or out. */
	UFUNCTION(BlueprintImplementableEvent, Category = "SimWorld|HUD")
	void OnPromptVisibilityChanged(bool bVisible);

private:
	// Bound to the delegates — must be UFUNCTION for AddDynamic.
	UFUNCTION()
	void HandleBalanceChanged(float NewBalance);

	UFUNCTION()
	void HandleFocusChanged(bool bHasFocus, const FText& Prompt);

	TWeakObjectPtr<USimEconomyComponent> BoundEconomy;
	TWeakObjectPtr<ASimCharacter> BoundCharacter;
};
