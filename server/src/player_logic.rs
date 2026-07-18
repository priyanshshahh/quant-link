/**
 * Vibe Coding Starter Pack: 3D Multiplayer - player_logic.rs
 * 
 * This file contains the core movement and player state update logic.
 * It's separated from lib.rs to improve modularity and maintainability.
 * 
 * Key components:
 * 
 * 1. Movement Calculation:
 *    - calculate_new_position: Computes player movement based on input and rotation
 *    - Vector math for converting input to movement direction
 *    - Direction normalization and speed application
 * 
 * 2. State Management:
 *    - update_input_state: Updates player state based on client input
 *    - Handles position, animation, and derived state (is_moving, is_running)
 *    - Translates raw input to game state
 *
 * Extension points:
 *    - Add terrain logic for realistic height adjustments
 *    - Implement server-side animation determination (commented example provided)
 *    - Add collision detection in calculate_new_position
 *
 * Related files:
 *    - common.rs: Provides shared data types and constants
 *    - lib.rs: Calls into this module's functions from reducers
 */

// Import common structs and constants
use crate::common::{Vector3, InputState, PLAYER_SPEED, SPRINT_MULTIPLIER};
// Import the PlayerData struct definition (assuming it's in lib.rs or common.rs)
use crate::PlayerData;

// Corrected movement logic based on reversed feedback
pub fn calculate_new_position(position: &Vector3, rotation: &Vector3, input: &InputState, delta_time: f32) -> Vector3 {
    let has_movement_input = input.forward || input.backward || input.left || input.right;

    if has_movement_input {
        let speed = if input.sprint { PLAYER_SPEED * SPRINT_MULTIPLIER } else { PLAYER_SPEED };

        // This approach more directly matches the new client implementation
        // Create basis vectors for movement (forward/right vectors from camera)
        // -Z is forward in Three.js coordinates 
        let yaw = rotation.y;
        
        // Forward and right unit vectors (initially along axes)
        let forward = Vector3 { x: 0.0, y: 0.0, z: -1.0 };
        let right = Vector3 { x: 1.0, y: 0.0, z: 0.0 };
        
        // Rotate these vectors based on player rotation (around Y-axis)
        // These are the rotation formulas for vectors around Y axis
        let cos_yaw = yaw.cos();
        let sin_yaw = yaw.sin();
        
        // Apply rotation to forward vector
        let rotated_forward = Vector3 {
            x: forward.x * cos_yaw + forward.z * sin_yaw,
            y: 0.0,
            z: -forward.x * sin_yaw + forward.z * cos_yaw,
        };
        
        // Apply rotation to right vector
        let rotated_right = Vector3 {
            x: right.x * cos_yaw + right.z * sin_yaw,
            y: 0.0,
            z: -right.x * sin_yaw + right.z * cos_yaw,
        };
        
        // Accumulate movement along these basis vectors
        let mut direction = Vector3 { x: 0.0, y: 0.0, z: 0.0 };
        
        if input.forward {
            direction.x -= rotated_forward.x;
            direction.z -= rotated_forward.z;
        }
        if input.backward {
            direction.x += rotated_forward.x;
            direction.z += rotated_forward.z;
        }
        if input.right {
            direction.x -= rotated_right.x;
            direction.z -= rotated_right.z;
        }
        if input.left {
            direction.x += rotated_right.x;
            direction.z += rotated_right.z;
        }
        
        // Normalize for consistent speed in all directions
        let magnitude = (direction.x.powi(2) + direction.z.powi(2)).sqrt();
        if magnitude > 0.01 {
            direction.x /= magnitude;
            direction.z /= magnitude;
        }
        
        // Apply speed and delta time
        direction.x *= speed * delta_time;
        direction.z *= speed * delta_time;
        
        // Create new position
        let mut new_position = position.clone();
        new_position.x += direction.x;
        new_position.z += direction.z;
        
        // For terrain, you could implement height logic here if needed
        // Example: new_position.y = calculate_terrain_height(new_position.x, new_position.z);
        
        return new_position;
    } else {
        // No movement input, return current position
        position.clone()
    }
}

// Note: Animation determination is currently handled client-side
// You could implement server-side animation logic here if needed
// For example:
// pub fn determine_animation(input: &InputState) -> String {
//     let is_moving = input.forward || input.backward || input.left || input.right;
//     if input.attack { return "attack1".to_string(); }
//     if input.jump { return "jump".to_string(); }
//     if is_moving {
//         if input.sprint { "run-forward".to_string() }
//         else { "walk-forward".to_string() }
//     } else {
//         "idle".to_string()
//     }
// }

// Update player state based on input.
//
// `dt` is the server-measured, clamped elapsed time since this player's last
// input (see `rules::clamp_input_dt` / `lib::update_player_input`), NOT a fixed
// 1/20s assumption — this is what makes movement speed independent of how often
// the client actually sends, closing the speed-hack vector.
pub fn update_input_state(
    player: &mut PlayerData,
    input: InputState,
    client_rot: Vector3,
    client_animation: String,
    dt: f32,
) {
    let new_position = calculate_new_position(
        &player.position,
        &client_rot, // Use client rotation for direction calc
        &input,
        dt,
    );

    // Update player state
    player.position = new_position;
    player.rotation = client_rot;
    player.current_animation = client_animation;
    player.input = input.clone(); // Store the input that caused this state
    player.last_input_seq = input.sequence;
    player.is_moving = input.forward || input.backward || input.left || input.right;
    player.is_running = player.is_moving && input.sprint;
    player.is_attacking = input.attack;
    player.is_casting = input.cast_spell;
}
