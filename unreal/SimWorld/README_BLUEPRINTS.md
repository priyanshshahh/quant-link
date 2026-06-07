# SimWorld — Blueprint Integration Guide

GTA-style economy vertical slice for **Unreal Engine 5.4** (City Sample compatible).
All gameplay logic is in C++; you only wire references and author visuals in the editor.

> ⚠️ This is a **separate Unreal project** under `unreal/SimWorld/`. It does NOT
> affect the deployed React/Three.js + SpacetimeDB web game. UE5 C++ must be
> compiled inside the Unreal Editor / your IDE — it cannot be built from this
> web workspace.

---

## 0. File Map

```
unreal/SimWorld/
├── SimWorld.uproject
├── README_BLUEPRINTS.md
└── Source/
    ├── SimWorld.Target.cs
    ├── SimWorldEditor.Target.cs
    └── SimWorld/
        ├── SimWorld.Build.cs
        ├── SimWorld.h / .cpp                  (module)
        ├── Interfaces/SimInteractable.h        (1) interaction contract
        ├── Economy/SimSaveGame.h               (2) save payload
        ├── Economy/SimEconomyComponent.h/.cpp  (2) wallet + delegate + save/load
        ├── Vehicles/SimVehicle.h/.cpp          (3) Chaos vehicle, buy/possess
        ├── Player/SimCharacter.h/.cpp          (4) raycast + interact + camera
        ├── Player/SimPlayerController.h/.cpp    (4) possession swap
        └── UI/SimHUDWidget.h/.cpp               (5) CommonUI HUD + delegate hooks
```

---

## 1. First Compile

1. Copy the `SimWorld` folder somewhere with the Unreal launcher installed.
2. Right-click `SimWorld.uproject` → **Generate Visual Studio / Xcode project files**.
3. Open the solution and **Build** (or just open the `.uproject` and let it compile).
4. Confirm the **Enhanced Input**, **Chaos Vehicles**, and **Common UI** plugins are
   enabled (they're declared in the `.uproject`, but verify in *Edit → Plugins*).

---

## 2. Player Setup

1. **BP_SimCharacter** (Blueprint Class → parent `SimCharacter`).
   - Add a skeletal mesh + AnimBP (e.g. the City Sample mannequin).
   - Create Input Assets: `IA_Interact`, `IA_Move`, `IA_Look`, and an
     `IMC_Default` mapping context (Interact → **E**).
   - Assign these to the matching fields under **SimWorld|Input** in the BP defaults.
2. **BP_SimPlayerController** (parent `SimPlayerController`).
3. **BP_SimGameMode**: set Default Pawn = `BP_SimCharacter`,
   Player Controller = `BP_SimPlayerController`,
   **Player State** = a BP that has a `SimEconomyComponent` added (see §3).

---

## 3. Economy (wallet on the Player State)

1. Create **BP_SimPlayerState** (parent `PlayerState`) and **Add Component →
   `SimEconomyComponent`**. Set `StartingBalance` (e.g. 100000).
2. Set this as the **Player State Class** in `BP_SimGameMode`.
3. The wallet auto-loads from the `SimWorldProfile` save slot on BeginPlay.
   Call `SaveWealth` on quit / after big purchases (e.g. from GameInstance shutdown).

> **No casting needed for UI:** the component exposes the `OnBalanceChanged`
> multicast delegate; the HUD binds to it (see §5).

---

## 4. Vehicles (buy / drive)

1. **BP_SimVehicle** (parent `SimVehicle`) — `SimVehicle` is `Abstract`, so you
   must create a BP child. Set up the Chaos `VehicleMovementComponent`, wheels,
   and skeletal mesh as per the Chaos Vehicle docs.
2. Set **VehicleName** and **Price** in defaults; leave **bIsOwnedByPlayer** = false
   for dealership cars.
3. **InfoWidget** (a `UWidgetComponent`) is created in C++ in *Screen* space.
   Assign a `WBP_VehicleBadge` showing `VehicleName` + `Price`. Refresh it from the
   **OnVehicleStateChanged** event (fires after purchase).
4. Make sure the vehicle's collision blocks the **Visibility** channel so the
   character's camera raycast can detect it.

**Flow:** look at an unowned car → HUD shows *"Press E to Buy {Name} ${Price}"* →
press E → if affordable, money is deducted and ownership flips → look again →
*"Press E to Drive"* → press E → you possess and drive it. Add a "leave vehicle"
input that calls `SimPlayerController::ExitVehicle`.

---

## 5. HUD (CommonUI + Glassmorphism)

1. Create **WBP_SimHUD** (parent `SimHUDWidget`).
2. Add two text blocks named **EXACTLY** `BalanceText` and `PromptText`
   (these auto-bind via `BindWidgetOptional`).
3. In your HUD/PlayerController BeginPlay, create the widget and call:
   - `BindToEconomy(PlayerState's SimEconomyComponent)`
   - `BindToCharacter(the possessed SimCharacter)`
4. Implement the two designer events in the WBP graph:
   - **OnBalancePulse(NewBalance)** → play an animation: *fade in → hold → fade out
     after 3s* (minimalist: only show money when it changes).
   - **OnPromptVisibilityChanged(bVisible)** → slide/fade the prompt in/out.

### Glassmorphism styling (in WBP)
- Wrap the panel in a **Background Blur** widget (Blur Strength ≈ 12–18).
- Put a **Border** over it: fill color `#14102866` (dark, ~40% alpha),
  1px stroke `#00E5FF59` for the neon edge.
- **Typography:** import **Inter** (or Roboto) as a Font asset. Balance = 700 weight,
  tabular figures, color `#39FF14` (gain) / `#FF4466` (loss). Prompt = 600 weight, white.
- Keep contrast high (WCAG AA): light text on the dark blurred panel.

---

## 6. (Optional) SpacetimeDB Sync

The web build is already server-authoritative on SpacetimeDB (`quant-link`).
To make this Unreal client share the same backend:

1. Add the **SpacetimeDB Unreal SDK** plugin and run
   `spacetime generate --lang <unreal>` against the `quant-link` module.
2. In `USimEconomyComponent::RemoveMoney` / `AddMoney`, instead of mutating
   `CurrentBalance` locally, call the generated reducers (`execute_trade`,
   `buy_vehicle`) and update `CurrentBalance` from the table subscription
   callback — then broadcast `OnBalanceChanged`. This keeps the 3D web players
   and Unreal players in one shared, authoritative economy.

---

## System → Requirement Cross-Check

| # | System | Class | Key proof |
|---|--------|-------|-----------|
| 1 | Interaction interface | `ISimInteractable` | `Interact(AActor*)`, `GetInteractPrompt() -> FText` (BlueprintNativeEvent) |
| 2 | Economy | `USimEconomyComponent` + `USimSaveGame` | `AddMoney/RemoveMoney/CanAfford`, `FOnBalanceChanged`, `SaveGameToSlot/LoadGameFromSlot` |
| 3 | Vehicle | `ASimVehicle : AWheeledVehiclePawn` | implements interface; buy-vs-possess logic; `UWidgetComponent` badge |
| 4 | Player | `ASimCharacter` + `ASimPlayerController` | 0.1s camera `LineTraceSingleByChannel`; `EnterVehicle/ExitVehicle` possession |
| 5 | UI | `USimHUDWidget : UCommonUserWidget` | binds `OnBalanceChanged`; designer fade hooks; glassmorphism instructions |
