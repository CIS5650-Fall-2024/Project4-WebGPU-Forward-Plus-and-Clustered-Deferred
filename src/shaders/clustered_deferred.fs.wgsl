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


struct FragmentOutput
{
    @location(0) albedo: vec4<f32>,
    @location(1) normal: vec4<f32>,
    @location(2) depth: f32
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let normal : vec3<f32> = normalize(in.nor);
    let depth : f32 = in.pos.z;

    return FragmentOutput(diffuseColor, vec4<f32>(normal, 0.0), depth);
}
