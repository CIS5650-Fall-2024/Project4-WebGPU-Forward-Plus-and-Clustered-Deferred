// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.
@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterLights: array<u32>;

@group(1) @binding(0) var positionTex: texture_2d<f32>;
@group(1) @binding(1) var normalTex: texture_2d<f32>;
@group(1) @binding(2) var albedoTex: texture_2d<f32>;

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {

    let screenWidth = cameraUniforms.screenWidth;
    let screenHeight = cameraUniforms.screenHeight;
    let uv01 = vec2f(fragCoord.x / screenWidth, fragCoord.y / screenHeight);
    let uvScreen = vec2i(i32(fragCoord.x), i32(fragCoord.y));

    let pos = textureLoad(positionTex, uvScreen, 0).xyz;
    let nor = textureLoad(normalTex, uvScreen, 0).xyz;
    let albedo = textureLoad(albedoTex, uvScreen, 0).rgb;


    //vec2 ndcPos = fragCoord
    let xCluster = u32(uv01.x * f32(${clusterCountX}));
    let yCluster = u32((1.0 - uv01.y)  * f32(${clusterCountY}));

    // Calculate cluster indices using logarithmic depth
    var viewPos =  cameraUniforms.viewMat * vec4f(pos, 1.0);
    let depth = -viewPos.z;

    let far = cameraUniforms.farPlane;
    let near = cameraUniforms.nearPlane;

    let logRatio = log(far / near);
    var zClusterF32: f32;
    
    let depthClamped = clamp(depth, near, far);
    zClusterF32 = (log(depthClamped / near) / logRatio) * f32(${clusterCountZ});

    var zCluster = u32((floor(zClusterF32)));

    let clusterIdX = clamp(xCluster, 0u, ${clusterCountX}u - 1u);
    let clusterIdY = clamp(yCluster, 0u, ${clusterCountY}u - 1u);
    let clusterIdZ = clamp(zCluster, 0u, ${clusterCountZ}u - 1u);

    let clusterIndex = clusterIdX + clusterIdY * ${clusterCountX}u + clusterIdZ * ${clusterCountX}u * ${clusterCountY}u;
    let clusterOffset = clusterIndex * (1u + ${maxLightsPerCluster}u);

    let numLights = clusterLights[clusterOffset];

    var totalLightContrib = vec3f(0.0, 0.0, 0.0);

    for (var i = 0u; i < numLights; i = i + 1u) {
        let lightIdx = clusterLights[clusterOffset + 1u + i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, pos, nor);
    }

    var finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1.0);
    //return vec4(f32(xCluster)/10.0,f32(yCluster)/10.0,0.0, 1.0);
}