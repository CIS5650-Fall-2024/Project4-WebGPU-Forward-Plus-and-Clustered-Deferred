// TODO-3: implement the Clustered Deferred fullscreen fragment shader
// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: array<ClusterSet>;

// textures
@group(${bindGroup_texture}) @binding(0) var posTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(1) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_texture}) @binding(2) var normalTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {

    let index = vec2i(floor(fragPos.xy));

    let worldPos = textureLoad(posTex, index, 0).xyz;
    let diffuse = textureLoad(diffuseTex, index, 0);
    let normal = textureLoad(normalTex, index, 0).xyz;

    let clipPos = cameraUniforms.viewProj * vec4f(worldPos, 1.0);

    let xIdx = u32((clipPos.x / clipPos.w + 1.0) / 2.0 * ${clusterSize});
    let yIdx = u32((clipPos.y / clipPos.w + 1.0) / 2.0 * ${clusterSize});

    let viewPos = cameraUniforms.view * vec4f(worldPos, 1.0);
    let logDepth = log(cameraUniforms.far / cameraUniforms.near);
    let zIdx = u32(log(-viewPos.z / cameraUniforms.near) / logDepth * ${clusterSize});

    let clusterIdx = xIdx + yIdx * ${clusterSize} + zIdx * ${clusterSize} * ${clusterSize};

    //----------------------------------------------------------

    let clusterLights = clusterSet[clusterIdx].numLights;
    var totalLightContrib = vec3f(0, 0, 0);
    for (var l = 0u; l < clusterLights; l++) {
        let light = lightSet.lights[clusterSet[clusterIdx].lights[l]];
        let lightContrib = calculateLightContrib(light, worldPos, normal);
        totalLightContrib += lightContrib;
    }

    var finalColor = diffuse.rgb * totalLightContrib;
    return vec4<f32>(finalColor, 1.0);
}