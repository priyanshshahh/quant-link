// Copyright QuantLink. Epic Games C++ Coding Standard.

#include "Player/SimPlayerController.h"
#include "Vehicles/SimVehicle.h"
#include "GameFramework/Character.h"

void ASimPlayerController::EnterVehicle(ASimVehicle* Vehicle)
{
	if (!Vehicle || Vehicle == CurrentVehicle)
	{
		return;
	}

	// Remember the on-foot pawn so we can come back to it.
	if (ACharacter* AsCharacter = Cast<ACharacter>(GetPawn()))
	{
		StoredCharacter = AsCharacter;

		// Hide & disable collision on the character while it "sits inside" the car.
		AsCharacter->SetActorHiddenInGame(true);
		AsCharacter->SetActorEnableCollision(false);
		AsCharacter->DisableInput(this);
	}

	CurrentVehicle = Vehicle;
	Possess(Vehicle); // Chaos vehicle input now routes through this controller.
}

void ASimPlayerController::ExitVehicle()
{
	if (!CurrentVehicle || !StoredCharacter)
	{
		return;
	}

	// Drop the character next to the vehicle.
	const FVector ExitWorld = CurrentVehicle->GetActorLocation()
		+ CurrentVehicle->GetActorRotation().RotateVector(ExitOffset);
	StoredCharacter->SetActorLocation(ExitWorld, /*bSweep*/ true);

	// Restore the character and re-possess it.
	StoredCharacter->SetActorHiddenInGame(false);
	StoredCharacter->SetActorEnableCollision(true);
	StoredCharacter->EnableInput(this);

	Possess(StoredCharacter);

	CurrentVehicle = nullptr;
}
