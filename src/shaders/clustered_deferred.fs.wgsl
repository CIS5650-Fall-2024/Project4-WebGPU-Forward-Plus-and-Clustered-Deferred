// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    // --- Pack color directly ---
    let r = u32(diffuseColor.r * 255.0);
    let g = u32(diffuseColor.g * 255.0);
    let b = u32(diffuseColor.b * 255.0);
    let packedColor: u32 = (r << 16) | (g << 8) | b;
    let packedColorFloat = f32(packedColor) / 16777215.0; 

    return vec4(in.nor.x, in.nor.y, in.nor.z, packedColorFloat);
}