// Fragment shader
@group(0) @binding(0) var depthTexture: texture_depth_2d;
@group(0) @binding(1) var depthSampler: sampler;

struct FragmentInput
{
    @location(0) uv: vec2f
}

@fragment
fn fs_main(in: FragmentInput) -> @location(0) vec4<f32> {
    let texCoords = in.uv.xy; 
    var depth = textureSample(depthTexture, depthSampler, in.uv);
    //return vec4(in.uv, 0.0, 1.0);
    //depth = pow(depth, 40);
    return vec4<f32>(vec3(depth), 1.0);
}