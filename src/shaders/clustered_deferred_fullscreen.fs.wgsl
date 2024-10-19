// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_fullscreen}) @binding(0) var<storage, read> lightSet: LightSet;
@group(${bindGroup_fullscreen}) @binding(1) var<storage, read> clusters: array<Cluster>;
@group(${bindGroup_fullscreen}) @binding(2) var albedoTex: texture_2d<f32>;
@group(${bindGroup_fullscreen}) @binding(3) var normalTex: texture_2d<f32>;
@group(${bindGroup_fullscreen}) @binding(4) var depthTex: texture_depth_2d;

@fragment
fn main(@builtin(position) fragPos: vec4f) -> @location(0) vec4f {
    let index = vec2u(fragPos.xy);
    let depth = textureLoad(depthTex, index, 0);
    let albedo = textureLoad(albedoTex, index, 0);
    let normal = textureLoad(normalTex, index, 0).xyz;

    if (depth == 1) {
      discard;
    }

    let bufferSize = textureDimensions(depthTex);
    let coordUV = fragPos.xy / vec2f(bufferSize);
    
    let clipPos = vec4(coordUV.x * 2.0 - 1.0, (1.0 - coordUV.y) * 2.0 - 1.0, depth, 1.0);
    let worldPosW = cameraUniforms.invViewProj * clipPos;
    let worldPos = worldPosW / worldPosW.w;
    let viewPos = cameraUniforms.view * worldPos;

    let clusterIdx = clusterIdx1d(
      u32(coordUV.x * ${clusterX}),
      u32((1 - coordUV.y) * ${clusterY}),
      zViewToSlice(viewPos.z, &cameraUniforms)
    );

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < clusters[clusterIdx].numLights; lightIdx++) {
        let light = lightSet.lights[clusters[clusterIdx].lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, worldPos.xyz, normal);
    }

    let finalColor = albedo.rgb * totalLightContrib;
    return vec4f(finalColor, 1);
}