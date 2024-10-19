struct FragmentInput {
    @location(0) pos: vec3f,   // World-space position
    @location(1) nor: vec3f,   // Normal
    @location(2) uv: vec2f     // UV for texture sampling
}

struct FragmentOutput {
    @location(0) position: vec4f,  // Output for Position
    @location(1) normal: vec4f,    // Output for Normal
    @location(2) albedo: vec4f    // Output for Albedo
}

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    // Sample the diffuse color
    let albedo = textureSample(diffuseTex, diffuseTexSampler, in.uv).rgb;
    
    // Store normalized normal vector
    let normal = normalize(in.nor);

    // Store world-space position
    let position = in.pos;

    // Return the outputs as a struct
    return FragmentOutput(
        vec4(position, 1.0),           // Position output
        vec4(normal * 0.5 + 0.5, 1.0), // Normal mapped to [0, 1]
        vec4(albedo, 1.0)              // Albedo output
    );
}