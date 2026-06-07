// Copyright QuantLink. Epic Games C++ Coding Standard.

#include "Player/SimCharacter.h"
#include "Interfaces/SimInteractable.h"
#include "Camera/CameraComponent.h"
#include "GameFramework/SpringArmComponent.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "Components/CapsuleComponent.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "InputMappingContext.h"
#include "InputAction.h"

ASimCharacter::ASimCharacter()
{
	PrimaryActorTick.bCanEverTick = false;

	// Orbiting spring arm + camera (GTA-style third person).
	CameraBoom = CreateDefaultSubobject<USpringArmComponent>(TEXT("CameraBoom"));
	CameraBoom->SetupAttachment(GetRootComponent());
	CameraBoom->TargetArmLength = 350.0f;
	CameraBoom->bUsePawnControlRotation = true;

	FollowCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FollowCamera"));
	FollowCamera->SetupAttachment(CameraBoom, USpringArmComponent::SocketName);
	FollowCamera->bUsePawnControlRotation = false;

	// Movement faces the direction of travel.
	bUseControllerRotationYaw = false;
	if (UCharacterMovementComponent* Move = GetCharacterMovement())
	{
		Move->bOrientRotationToMovement = true;
		Move->RotationRate = FRotator(0.0f, 540.0f, 0.0f);
	}
}

void ASimCharacter::BeginPlay()
{
	Super::BeginPlay();

	// Register the Enhanced Input mapping context for this local player.
	if (const APlayerController* PC = Cast<APlayerController>(GetController()))
	{
		if (UEnhancedInputLocalPlayerSubsystem* Subsystem =
			ULocalPlayer::GetSubsystem<UEnhancedInputLocalPlayerSubsystem>(PC->GetLocalPlayer()))
		{
			if (DefaultMappingContext)
			{
				Subsystem->AddMappingContext(DefaultMappingContext, 0);
			}
		}
	}

	// Scan for interactables on a fixed cadence (every TraceInterval seconds).
	GetWorldTimerManager().SetTimer(
		TraceTimerHandle, this, &ASimCharacter::TraceForInteractable, TraceInterval, /*bLoop*/ true);
}

void ASimCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	if (UEnhancedInputComponent* EIC = Cast<UEnhancedInputComponent>(PlayerInputComponent))
	{
		if (InteractAction)
		{
			EIC->BindAction(InteractAction, ETriggerEvent::Started, this, &ASimCharacter::OnInteract);
		}
		if (MoveAction)
		{
			EIC->BindAction(MoveAction, ETriggerEvent::Triggered, this, &ASimCharacter::OnMove);
		}
		if (LookAction)
		{
			EIC->BindAction(LookAction, ETriggerEvent::Triggered, this, &ASimCharacter::OnLook);
		}
	}
}

void ASimCharacter::TraceForInteractable()
{
	if (!FollowCamera)
	{
		return;
	}

	// Ray cast straight out of the camera.
	const FVector Start = FollowCamera->GetComponentLocation();
	const FVector End = Start + FollowCamera->GetForwardVector() * TraceDistance;

	FHitResult Hit;
	FCollisionQueryParams Params;
	Params.AddIgnoredActor(this);

	AActor* NewFocus = nullptr;
	if (GetWorld()->LineTraceSingleByChannel(Hit, Start, End, ECC_Visibility, Params))
	{
		AActor* HitActor = Hit.GetActor();
		if (HitActor && HitActor->GetClass()->ImplementsInterface(USimInteractable::StaticClass()))
		{
			NewFocus = HitActor;
		}
	}

	// Only notify the HUD when the focused actor actually changes.
	if (NewFocus == FocusedActor.Get())
	{
		return;
	}

	FocusedActor = NewFocus;

	if (NewFocus)
	{
		const FText Prompt = ISimInteractable::Execute_GetInteractPrompt(NewFocus);
		OnFocusedInteractableChanged.Broadcast(true, Prompt);
	}
	else
	{
		OnFocusedInteractableChanged.Broadcast(false, FText::GetEmpty());
	}
}

void ASimCharacter::OnInteract(const FInputActionValue& /*Value*/)
{
	AActor* Target = FocusedActor.Get();
	if (Target && Target->GetClass()->ImplementsInterface(USimInteractable::StaticClass()))
	{
		// Forward to the interface; "this" is the instigator (the player pawn).
		ISimInteractable::Execute_Interact(Target, this);
	}
}

void ASimCharacter::OnMove(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	if (!Controller || Axis.IsNearlyZero())
	{
		return;
	}

	const FRotator YawRotation(0.0f, Controller->GetControlRotation().Yaw, 0.0f);
	const FVector Forward = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::X);
	const FVector Right = FRotationMatrix(YawRotation).GetUnitAxis(EAxis::Y);

	AddMovementInput(Forward, Axis.Y);
	AddMovementInput(Right, Axis.X);
}

void ASimCharacter::OnLook(const FInputActionValue& Value)
{
	const FVector2D Axis = Value.Get<FVector2D>();
	AddControllerYawInput(Axis.X);
	AddControllerPitchInput(Axis.Y);
}
