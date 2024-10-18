// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.

@group(${bindGroup_scene}) @binding(0) var<uniform> camera: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read_write> clusterSet: ClusterSet;




@group(${bindGroup_fullscreen}) @binding(0) var albedoTex: texture_2d<f32>;
@group(${bindGroup_fullscreen}) @binding(1) var albedoTexSampler: sampler;
@group(${bindGroup_fullscreen}) @binding(2) var normalTex: texture_2d<f32>;
@group(${bindGroup_fullscreen}) @binding(3) var normalTexSampler: sampler;
//https://www.w3.org/TR/WGSL/#texture-depth
@group(${bindGroup_fullscreen}) @binding(4) var depthTex: texture_depth_2d;
@group(${bindGroup_fullscreen}) @binding(5) var depthTexSampler: sampler;


struct FragmentInput
{
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
}


struct FragmentOutput {
    @location(0) color: vec4<f32>,
};

@fragment
fn main(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

    // Fetch G-buffer values
    let uv = vec2<f32>(input.uv.x, 1.0 - input.uv.y);
    let normal = textureSample(normalTex, normalTexSampler, uv).xyz;
    let albedo = textureSample(albedoTex, albedoTexSampler ,uv);
    let depth = textureSample(depthTex, depthTexSampler,uv);


    let clusterGridSizeX = ${clusterXsize};
    let clusterGridSizeY = ${clusterYsize};
    let clusterGridSizeZ = ${clusterZsize};
    let far = camera.farPlane;
    let near = camera.nearPlane;
    


    let ndcPos = vec3<f32>(input.uv * 2.0 - 1.0, depth);
    let worldPosH = camera.invViewMat * camera.invProjMat * vec4<f32>(ndcPos, 1.0);
    let worldPos = worldPosH.xyz/worldPosH.w;

    let viewPos = camera.viewMat * vec4<f32>(worldPos, 1.0);
    let zDepth = viewPos.z;
    let clusterZ = u32(log(abs(zDepth) / near) / log(far / near) * f32(clusterGridSizeZ));
    
    let screenPos = camera.viewProjMat * vec4<f32>(worldPos, 1.0);
    let ndcPos2 = screenPos.xyz / screenPos.w;
    let clusterX = u32((ndcPos2.x + 1.0) * 0.5 * f32(clusterGridSizeX));
    let clusterY = u32((ndcPos2.y + 1.0) * 0.5 * f32(clusterGridSizeY));

    let clusterIndex = clusterZ * u32(clusterGridSizeX) * u32(clusterGridSizeY) +
                       clusterY * u32(clusterGridSizeX) +
                       clusterX;

    let cluster_ptr = &(clusterSet.clusters[clusterIndex]);
    var totalLightContrib = vec3<f32>(0.0, 0.0, 0.0);
    for (var i = 0u; i < (*cluster_ptr).numLights; i++) {
        let lightIdx = (*cluster_ptr).lightIndices[i];
        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, worldPos, normal);
    }

    let finalColor = albedo.rgb * totalLightContrib;
    output.color = vec4f(finalColor, 1.0);
    // let newColor = vec3f(f32(clusterX), f32(clusterY), f32(clusterZ)) / vec3f(f32(clusterGridSizeX), f32(clusterGridSizeY), f32(clusterGridSizeZ));
    //output.color = vec4f(newColor, 1);

    return output;
}
