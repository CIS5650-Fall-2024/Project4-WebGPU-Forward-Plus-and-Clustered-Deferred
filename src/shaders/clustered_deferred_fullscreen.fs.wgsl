// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;
@group(${bindGroup_scene}) @binding(3) var depthTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(4) var gBufferTexture: texture_2d<f32>;
@group(${bindGroup_scene}) @binding(5) var gBufferSampler: sampler;

@fragment
fn main(@builtin(position) in: vec4f) -> @location(0) vec4f {
    
    let buffer_size = textureDimensions(depthTexture);
    let uv = in.xy / vec2f(buffer_size);

    let data = textureSample(gBufferTexture, gBufferSampler, uv);
    let normal = data.xyz;

    // --- Unpack color ---
    let packedColor: u32 = u32(data.w * 16777215.0);
    let r = (packedColor >> 16) & 0xFF;
    let g = (packedColor >> 8) & 0xFF;
    let b = packedColor & 0xFF;
    let diffuseColor = vec3f(f32(r) / 255.0, f32(g) / 255.0, f32(b) / 255.0); 

    let depth = textureLoad(depthTexture, vec2i(floor(in.xy)), 0);

    let pos = vec4(uv.x, uv.y, depth.x, 1.0);

    let screenSpacePos = (cameraUniforms.viewProjMat * pos).xyz;
    
    let clusterPosX = u32(floor(((screenSpacePos.xy / screenSpacePos.z).x * 0.5 + 0.5) * f32(clusterSet.clusterCount[0])));
    let clusterPosY = u32(floor(((screenSpacePos.xy / screenSpacePos.z).y * 0.5 + 0.5) * f32(clusterSet.clusterCount[1])));
    let clusterPosZ = u32(floor((-screenSpacePos.z - ${nearPlane}) / (${farPlane} - ${nearPlane}) * f32(clusterSet.clusterCount[2])));
    
    let clusterIdx = clusterPosX + 
                       clusterPosY * clusterSet.clusterCount[0] + 
                       clusterPosZ * clusterSet.clusterCount[0] * clusterSet.clusterCount[1];

    let cluster = clusterSet.clusters[clusterIdx];

    var totalLightContrib = vec3f(0, 0, 0);
    for (var lightIdx = 0u; lightIdx < cluster.noOfLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightArray[lightIdx]];
        totalLightContrib += calculateLightContrib(light, pos.xyz, normal);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;
    return vec4(finalColor, 1);
}