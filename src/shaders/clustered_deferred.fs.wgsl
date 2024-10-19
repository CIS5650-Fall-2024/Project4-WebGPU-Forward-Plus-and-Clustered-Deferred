// TODO-3: implement the Clustered Deferred G-buffer fragment shader

// This shader should only store G-buffer information and should not do any shading.

@group(${bindGroup_scene}) @binding(0) var<uniform> camUnif: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTexture: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseSampler: sampler;


struct FragmentInput
{
    @location(0) pos: vec3<f32>,
    @location(1) nor: vec3<f32>,
    @location(2) uv: vec2<f32>
}

struct GBufferOutput
{
    @location(0) position: vec4<f32>,
    @location(1) albedo: vec4<f32>,
    @location(2) normal: vec4<f32>,
}

@fragment
fn main(in: FragmentInput) -> GBufferOutput
{
    let diffuseColor = textureSample(diffuseTexture, diffuseSampler, in.uv);
    if (diffuseColor.a < 0.5) {
        discard;
    }

    var output = GBufferOutput();

    // Store the position in view space
    output.position = vec4(in.pos, 1.0);

    // Store the normal in view space
    output.normal = vec4(in.nor, 1.0);

    // Store the diffuse color
    output.albedo = diffuseColor;

    return output;
}
;