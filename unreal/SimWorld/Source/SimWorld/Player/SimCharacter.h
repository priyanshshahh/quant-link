// Copyright QuantLink. Epic Games C++ Coding Standard.

#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "SimCharacter.generated.h"

class USpringArmComponent;
class UCameraComponent;
class UInputMappingContext;
class UInputAction;
struct FInputActionValue;

/**
 * Broadcast when the player's camera focus enters/leaves an interactable.
 * The HUD binds to this to show/hide the diegetic prompt without polling.
 * Params: bHasFocus, Prompt (valid only when bHasFocus == true).
 */
DECLARE_DYNAMIC_MULTICAST_DELEGATE_TwoParams(FOnFocusedInteractableChanged, bool, bHasFocus, const FText&, Prompt);

/**
 * Third-person player character. Performs a camera ray cast on a 0.1s timer to
 * detect ISimInteractable actors and surface their prompt to the HUD. Pressing
 * the Interact action forwards to ISimInteractable::Interact.
 */
UCLASS()
class SIMWORLD_API ASimCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	ASimCharacter();

	UPROPERTY(BlueprintAssignable, Category = "SimWorld|Interaction")
	FOnFocusedInteractableChanged OnFocusedInteractableChanged;

protected:
	virtual void BeginPlay() override;
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;

	// --- Camera ---
	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SimWorld|Camera")
	TObjectPtr<USpringArmComponent> CameraBoom;

	UPROPERTY(VisibleAnywhere, BlueprintReadOnly, Category = "SimWorld|Camera")
	TObjectPtr<UCameraComponent> FollowCamera;

	// --- Enhanced Input ---
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Input")
	TObjectPtr<UInputMappingContext> DefaultMappingContext;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Input")
	TObjectPtr<UInputAction> InteractAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Input")
	TObjectPtr<UInputAction> MoveAction;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Input")
	TObjectPtr<UInputAction> LookAction;

	// --- Interaction tuning ---
	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Interaction")
	float TraceDistance = 500.0f;

	UPROPERTY(EditAnywhere, BlueprintReadWrite, Category = "SimWorld|Interaction")
	float TraceInterval = 0.1f;

private:
	/** Timer-driven camera ray cast that finds the focused interactable. */
	void TraceForInteractable();

	/** Input handlers. */
	void OnInteract(const FInputActionValue& Value);
	void OnMove(const FInputActionValue& Value);
	void OnLook(const FInputActionValue& Value);

	/** Currently focused interactable actor (implements USimInteractable). */
	TWeakObjectPtr<AActor> FocusedActor;

	FTimerHandle TraceTimerHandle;
};
