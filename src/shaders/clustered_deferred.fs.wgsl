// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

struct GOutput
{
    @location(0) albedo: vec4f,
    @location(1) normal: vec4f,
}

@fragment
fn main(in: FragmentInput) -> GOutput
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }


    let normal = vec4(normalize(in.nor), 0);

    var out: GOutput;
    out.albedo = diffuseColor;
    out.normal = normal;

    return out;
}
