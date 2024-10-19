// TODO-2: implement the Forward+ fragment shader

// See naive.fs.wgsl for basic fragment shader setup; this shader should use light clusters instead of looping over all lights

// ------------------------------------
// Shading process:
// ------------------------------------
// Determine which cluster contains the current fragment.
// Retrieve the number of lights that affect the current fragment from the cluster’s data.
// Initialize a variable to accumulate the total light contribution for the fragment.
// For each light in the cluster:
//     Access the light's properties using its index.
//     Calculate the contribution of the light based on its position, the fragment’s position, and the surface normal.
//     Add the calculated contribution to the total light accumulation.
// Multiply the fragment’s diffuse color by the accumulated light contribution.
// Return the final color, ensuring that the alpha component is set appropriately (typically to 1).

@group(${bindGroup_scene}) @binding(0) var<uniform> camUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;
@group(${bindGroup_cluster}) @binding(0) var<storage, read> clusterSet: ClusterSet;

struct FragmentInput
{
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

fn getZViewFromZNDC(ndcZ: f32) -> f32 {
    var view = ${farZ} * ${nearZ};
    view /= ${farZ} - ndcZ * (${farZ} - ${nearZ});
    return view; 
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }
    let clipPos = camUniforms.viewProjMat * vec4(in.pos, 1.0);
    let ndcPos = clipPos.xyz / clipPos.w;

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
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }
    //totalLightContrib = vec3f(f32(xIdx) / f32(clusterSet.numClustersX), f32(0), f32(0));
    //totalLightContrib = vec3f(f32(0), f32(yIdx) / f32(clusterSet.numClustersY), f32(0));
    //totalLightContrib = vec3f(f32(0), f32(0), f32(zIdx) / f32(clusterSet.numClustersZ));
    //totalLightContrib = vec3f(f32(0), f32(0), f32(ndcPos.z));
    //totalLightContrib = vec3f(cluster.maxBoundingBox.x, cluster.maxBoundingBox.y, cluster.maxBoundingBox.z);


    var finalColor = diffuseColor.rgb * totalLightContrib;
    //var finalColor = totalLightContrib;
    return vec4(finalColor, 1);
}
