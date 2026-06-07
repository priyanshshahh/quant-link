// Copyright QuantLink. Epic Games C++ Coding Standard.

#include "Economy/SimEconomyComponent.h"
#include "Economy/SimSaveGame.h"
#include "Kismet/GameplayStatics.h"

USimEconomyComponent::USimEconomyComponent()
{
	// No per-frame work; balance changes are event-driven.
	PrimaryComponentTick.bCanEverTick = false;
}

void USimEconomyComponent::BeginPlay()
{
	Super::BeginPlay();

	if (bAutoLoadOnBeginPlay)
	{
		LoadWealth();
	}
	else
	{
		CurrentBalance = StartingBalance;
		OnBalanceChanged.Broadcast(CurrentBalance);
	}
}

void USimEconomyComponent::AddMoney(float Amount)
{
	// Guard against negative "adds" — use RemoveMoney for deductions.
	if (Amount <= 0.0f)
	{
		return;
	}

	CurrentBalance += Amount;
	OnBalanceChanged.Broadcast(CurrentBalance);

	// SpacetimeDB hook: notify the server of credited funds here if authoritative.
}

bool USimEconomyComponent::RemoveMoney(float Amount)
{
	if (Amount <= 0.0f)
	{
		return true; // Nothing to remove is trivially successful.
	}

	if (!CanAfford(Amount))
	{
		return false; // Insufficient funds — leave balance untouched.
	}

	CurrentBalance -= Amount;
	OnBalanceChanged.Broadcast(CurrentBalance);

	// SpacetimeDB hook: call your `execute_trade` / `buy_vehicle` reducer here so
	// the server remains authoritative over the deduction.
	return true;
}

bool USimEconomyComponent::CanAfford(float Amount) const
{
	return CurrentBalance >= Amount;
}

void USimEconomyComponent::SaveWealth()
{
	USimSaveGame* SaveObject = Cast<USimSaveGame>(
		UGameplayStatics::CreateSaveGameObject(USimSaveGame::StaticClass()));

	if (!SaveObject)
	{
		return;
	}

	SaveObject->SavedBalance = CurrentBalance;
	SaveObject->SaveSlotName = SaveSlotName;
	SaveObject->UserIndex = UserIndex;

	UGameplayStatics::SaveGameToSlot(SaveObject, SaveSlotName, UserIndex);
}

void USimEconomyComponent::LoadWealth()
{
	if (UGameplayStatics::DoesSaveGameExist(SaveSlotName, UserIndex))
	{
		USimSaveGame* Loaded = Cast<USimSaveGame>(
			UGameplayStatics::LoadGameFromSlot(SaveSlotName, UserIndex));

		CurrentBalance = Loaded ? Loaded->SavedBalance : StartingBalance;
	}
	else
	{
		// First run for this profile — seed with the starting balance and persist.
		CurrentBalance = StartingBalance;
		SaveWealth();
	}

	OnBalanceChanged.Broadcast(CurrentBalance);
}
