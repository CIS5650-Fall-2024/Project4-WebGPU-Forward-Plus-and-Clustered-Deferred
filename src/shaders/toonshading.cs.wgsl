@group(${bindGroup_scene}) @binding(0) var inputTex : texture_2d<f32>;
@group(${bindGroup_scene}) @binding(1) var outputTex : texture_storage_2d<${presentationFormat}, write>;

@compute
@workgroup_size(1, 1)
fn main(@builtin(global_invocation_id) globalIdx: vec3u) {
    var albedo = textureLoad(
        inputTex,
        vec2i(globalIdx.xy),
        0
    ).xyz;
    let pos = globalIdx.xy;
    
    let oldIntensity = sqrt(albedo.x * albedo.x + albedo.y * albedo.y + albedo.z * albedo.z);
    let newIntensity = smoothstep(0, 0.45, oldIntensity);
    albedo = albedo * newIntensity / oldIntensity;

    textureStore(outputTex, pos, vec4f(albedo, 1.0));
}