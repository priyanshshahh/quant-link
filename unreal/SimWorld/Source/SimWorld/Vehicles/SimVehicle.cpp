// Copyright QuantLink. Epic Games C++ Coding Standard.

#include "Vehicles/SimVehicle.h"
#include "Components/WidgetComponent.h"
#include "Economy/SimEconomyComponent.h"
#include "Player/SimPlayerController.h"
#include "GameFramework/Controller.h"
#include "GameFramework/PlayerState.h"

ASimVehicle::ASimVehicle()
{
	PrimaryActorTick.bCanEverTick = false;

	// Diegetic, world-space badge floating above the roof.
	InfoWidget = CreateDefaultSubobject<UWidgetComponent>(TEXT("InfoWidget"));
	InfoWidget->SetupAttachment(GetRootComponent());
	InfoWidget->SetRelativeLocation(FVector(0.0f, 0.0f, 220.0f));
	InfoWidget->SetWidgetSpace(EWidgetSpace::Screen); // Always faces the camera.
	InfoWidget->SetDrawAtDesiredSize(true);
}

void ASimVehicle::BeginPlay()
{
	Super::BeginPlay();
	OnVehicleStateChanged();
}

USimEconomyComponent* ASimVehicle::ResolveEconomy(AActor* Instigator) const
{
	// The wallet lives on the PlayerState. Walk: Actor -> Pawn -> Controller -> PlayerState.
	const APawn* InstigatorPawn = Cast<APawn>(Instigator);
	if (!InstigatorPawn)
	{
		return nullptr;
	}

	const AController* InstigatorController = InstigatorPawn->GetController();
	if (!InstigatorController)
	{
		return nullptr;
	}

	APlayerState* PS = InstigatorController->PlayerState;
	return PS ? PS->FindComponentByClass<USimEconomyComponent>() : nullptr;
}

void ASimVehicle::Interact_Implementation(AActor* Instigator)
{
	APawn* InstigatorPawn = Cast<APawn>(Instigator);
	if (!InstigatorPawn)
	{
		return;
	}

	if (bIsOwnedByPlayer)
	{
		// --- POSSESS: hand control of this vehicle to the player ---
		if (ASimPlayerController* SimPC = Cast<ASimPlayerController>(InstigatorPawn->GetController()))
		{
			SimPC->EnterVehicle(this);
		}
		return;
	}

	// --- PURCHASE: try to deduct the price from the player's wallet ---
	USimEconomyComponent* Economy = ResolveEconomy(Instigator);
	if (!Economy)
	{
		return;
	}

	if (Economy->RemoveMoney(Price))
	{
		bIsOwnedByPlayer = true;
		OnVehicleStateChanged(); // Refresh badge ("OWNED — Press E to Drive").
	}
	// On failure RemoveMoney left the balance untouched; HUD can flash "insufficient funds".
}

FText ASimVehicle::GetInteractPrompt_Implementation() const
{
	if (bIsOwnedByPlayer)
	{
		return FText::Format(
			NSLOCTEXT("SimWorld", "DrivePrompt", "Press E to Drive  {0}"),
			VehicleName);
	}

	// Format price with grouping (e.g. $500,000).
	FNumberFormattingOptions Opts;
	Opts.SetUseGrouping(true);
	Opts.SetMaximumFractionalDigits(0);
	const FText PriceText = FText::AsNumber(Price, &Opts);

	return FText::Format(
		NSLOCTEXT("SimWorld", "BuyPrompt", "Press E to Buy  {0}  ${1}"),
		VehicleName, PriceText);
}
