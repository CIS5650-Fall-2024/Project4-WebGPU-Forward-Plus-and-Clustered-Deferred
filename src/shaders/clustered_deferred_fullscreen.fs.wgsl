// TODO-3: implement the Clustered Deferred fullscreen fragment shader

// Similar to the Forward+ fragment shader, but with vertex information coming from the G-buffer instead.


@group(${bindGroup_scene}) @binding(0) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(1) @binding(0) var<storage, read> clusterSet: ClusterSet;

@group(2) @binding(0) var albetoTexture: texture_2d<f32>;
@group(2) @binding(1) var albetoTexSampler: sampler;
@group(2) @binding(2) var depthTexture: texture_depth_2d;
@group(2) @binding(3) var depthTextureSampler: sampler;
@group(2) @binding(4) var normalTexture: texture_2d<f32>;
@group(2) @binding(5) var normalTexSampler: sampler;

struct DefFragmentInput
{
    @location(0) uv: vec2f
}

fn getZViewFromZNDC(ndcZ: f32) -> f32 {
    var view = ${farZ} * ${nearZ};
    view /= ${farZ} - ndcZ * (${farZ} - ${nearZ});
    return view; 
}

@fragment
fn main(in: DefFragmentInput) -> @location(0) vec4f
{
    let uv = vec2f(in.uv.x, 1.0 - in.uv.y);
    let diffuseColor = textureSample(albetoTexture, albetoTexSampler, uv);
    let normal = textureSample(normalTexture, normalTexSampler, uv);
    let depth = textureSample(depthTexture, depthTextureSampler, uv);

    /*let clipPos = camUniforms.viewProjMat * vec4(in.pos, 1.0);
    let ndcPos = clipPos.xyz / clipPos.w;*/
    let ndcPos = vec3f((2.0 * in.uv.x) - 1.0, (2.0 * in.uv.y) - 1.0, depth);
    let clipSpacePos = vec4f(ndcPos, 1.0);  
    let worldPos4 = camUniforms.invViewProjMat * clipSpacePos;
    let worldPos = worldPos4.xyz / worldPos4.w;


    /*
    below is good for visualizing the clusters
    let xIdx = (floor((0.5 * (ndcPos.x + 1)) * f32(clusterSet.numClustersX)))/f32(clusterSet.numClustersX);
    let yIdx = (floor((0.5 * (ndcPos.y + 1)) * f32(clusterSet.numClustersY)))/f32(clusterSet.numClustersY);
    let zIdx = (floor(ndcPos.z * f32(clusterSet.numClustersZ)) / f32(clusterSet.numClustersZ)); // * f32(clusterSet.numClustersZ)));
    */

    let xIdx = u32(floor((0.5 * (ndcPos.x + 1)) * f32(clusterSet.numClustersX)));
    let yIdx = u32(floor((0.5 * (-ndcPos.y + 1)) * f32(clusterSet.numClustersY)));

    let zView = getZViewFromZNDC(ndcPos.z);
    let zIdx = u32(floor(((zView - ${nearZ}) / (${farZ} - ${nearZ})) * f32(clusterSet.numClustersZ)));

    //let zIdx = u32(floor(ndcPos.z * f32(clusterSet.numClustersZ))); // * f32(clusterSet.numClustersZ)));
    let clusterIdx = xIdx * (clusterSet.numClustersY * clusterSet.numClustersZ) + yIdx * clusterSet.numClustersZ + zIdx; 
    let numClusters = clusterSet.numClustersX * clusterSet.numClustersY * clusterSet.numClustersZ;
    if clusterIdx >= numClusters {
        discard;
    }
    let clusterNumLights = clusterSet.clusters[clusterIdx].numLights;

    var totalLightContrib = vec3f(f32(0.0), f32(0.0), f32(0.0));

    for (var lightIdx = 0u; lightIdx < clusterNumLights; lightIdx++) {
        //totalLightContrib += vec3f(f32(0.01), f32(0.01), f32(0.01));
        let light = lightSet.lights[clusterSet.clusters[clusterIdx].lights[lightIdx]];
        totalLightContrib += calculateLightContrib(light, worldPos, normal.xyz);
    }
    //totalLightContrib = vec3f(f32(xIdx) / f32(clusterSet.numClustersX), f32(0), f32(0));
    //totalLightContrib = vec3f(f32(0), f32(yIdx) / f32(clusterSet.numClustersY), f32(0));
    //totalLightContrib = vec3f(f32(0), f32(0), f32(zIdx) / f32(clusterSet.numClustersZ));
    //totalLightContrib = vec3f(f32(0), f32(0), f32(ndcPos.z));
    //totalLightContrib = vec3f(cluster.maxBoundingBox.x, cluster.maxBoundingBox.y, cluster.maxBoundingBox.z);


    var finalColor = diffuseColor.rgb * totalLightContrib;
    //var finalColor = totalLightContrib;
    //var finalColor = depth;
    return vec4f(finalColor, 1);
}