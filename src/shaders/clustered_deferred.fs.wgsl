// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
}

@fragment
fn main(in: FragmentInput) -> (
    @location(0) vec4f, // position
    @location(1) vec4f, // normal
    @location(2) vec4f  // albedo
) {
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    return (
        vec4f(in.pos, 1.0),
        vec4f(in.nor, 0.0),
        vec4f(diffuseColor.rgb, 1.0)
    );
}