// Copyright QuantLink. Epic Games C++ Coding Standard.

#include "UI/SimHUDWidget.h"
#include "Economy/SimEconomyComponent.h"
#include "Player/SimCharacter.h"
#include "Components/TextBlock.h"

void USimHUDWidget::BindToEconomy(USimEconomyComponent* Economy)
{
	if (!Economy)
	{
		return;
	}

	// Avoid double-binding if called again.
	if (BoundEconomy.IsValid())
	{
		BoundEconomy->OnBalanceChanged.RemoveDynamic(this, &USimHUDWidget::HandleBalanceChanged);
	}

	BoundEconomy = Economy;
	Economy->OnBalanceChanged.AddDynamic(this, &USimHUDWidget::HandleBalanceChanged);

	// Prime the UI with the current value immediately.
	HandleBalanceChanged(Economy->GetBalance());
}

void USimHUDWidget::BindToCharacter(ASimCharacter* Character)
{
	if (!Character)
	{
		return;
	}

	if (BoundCharacter.IsValid())
	{
		BoundCharacter->OnFocusedInteractableChanged.RemoveDynamic(this, &USimHUDWidget::HandleFocusChanged);
	}

	BoundCharacter = Character;
	Character->OnFocusedInteractableChanged.AddDynamic(this, &USimHUDWidget::HandleFocusChanged);

	// Start with the prompt hidden.
	HandleFocusChanged(false, FText::GetEmpty());
}

void USimHUDWidget::HandleBalanceChanged(float NewBalance)
{
	if (BalanceText)
	{
		FNumberFormattingOptions Opts;
		Opts.SetUseGrouping(true);
		Opts.SetMaximumFractionalDigits(0);
		BalanceText->SetText(FText::Format(
			NSLOCTEXT("SimWorld", "BalanceFmt", "${0}"),
			FText::AsNumber(NewBalance, &Opts)));
	}

	// Let the WBP run its appear -> hold -> fade-after-3s timeline.
	OnBalancePulse(NewBalance);
}

void USimHUDWidget::HandleFocusChanged(bool bHasFocus, const FText& Prompt)
{
	if (PromptText)
	{
		PromptText->SetText(Prompt);
	}
	OnPromptVisibilityChanged(bHasFocus);
}

void USimHUDWidget::NativeDestruct()
{
	// Clean up delegate bindings to avoid dangling references.
	if (BoundEconomy.IsValid())
	{
		BoundEconomy->OnBalanceChanged.RemoveDynamic(this, &USimHUDWidget::HandleBalanceChanged);
	}
	if (BoundCharacter.IsValid())
	{
		BoundCharacter->OnFocusedInteractableChanged.RemoveDynamic(this, &USimHUDWidget::HandleFocusChanged);
	}

	Super::NativeDestruct();
}
