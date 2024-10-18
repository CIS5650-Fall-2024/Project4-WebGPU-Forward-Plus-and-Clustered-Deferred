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

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterSet: ClusterSet;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput
{
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f
}

fn hash33(p3 : vec3f) -> vec3f 
{
	var p = fract(p3 * vec3f(.1031, .1030, .0973));
    p += dot(p, p.yxz+33.33);
    return fract((p.xxy + p.yxx)*p.zyx);
}

@fragment
fn main(
    in: FragmentInput,
    @builtin(position) pixelPos: vec4f
) -> @location(0) vec4f
{
    var diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let linearClusterSize : u32 = u32(numGrid.x * numGrid.y * numGrid.z); 

    var posView : vec3f = (cameraUniforms.viewMat * vec4f(in.pos, 1.f)).xyz;

    var fragCoord = pixelPos; 

    // Locating which cluster this fragment is part of
    let zTile : u32 = u32((log(abs(posView.z) / zNear) * f32(numGrid.z)) / log(zFar / zNear));
    let tileSize : vec2f = cameraUniforms.canvasSize / vec2f(numGrid.xy);
    var tile : vec3<u32> = vec3<u32>(vec2<u32>(fragCoord.xy / tileSize), u32(zTile));

    let tileIndex : u32 = tile.x + (tile.y * numGrid.x) + (tile.z * numGrid.x * numGrid.y);

    let cluster : ptr<storage, Cluster, read> = &clusterSet.clusters[tileIndex];  

    var totalLightContrib = vec3f(0, 0, 0);

    for (var lightIdx = 0u; lightIdx < cluster.numLights; lightIdx++) {
        let light = lightSet.lights[cluster.lightIndices[lightIdx]];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    // debug visualization
    //diffuseColor = vec4f(hash33(cluster.minPoint.zzz), 1.); 
    //return vec4(diffuseColor.rgb, 1); 

    var finalColor = diffuseColor.rgb * totalLightContrib;

    return vec4(finalColor, 1);
}