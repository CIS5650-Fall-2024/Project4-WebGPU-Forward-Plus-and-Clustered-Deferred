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

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraData: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusters: array<Cluster>;
@group(${bindGroup_scene}) @binding(3) var<uniform> clusterGrid: ClusterGridMetadata; 

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @location(0) pos: vec3f, 
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
    @builtin(position) fragPixelPos: vec4f
}

@fragment
fn main(in: FragmentInput) -> @location(0) vec4f
{
    let diffuseColor = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (diffuseColor.a < 0.5f) {
        discard;
    }

    let clusterIndex = calculateClusterIndex(in.fragPixelPos, in.pos);
    let currentCluster = clusters[clusterIndex];

    var totalLightContrib = vec3f(0, 0, 0);

    for (var i = 0u; i < currentCluster.numLights; i++) {
        let lightIdx = currentCluster.lightIndices[i];

        let light = lightSet.lights[lightIdx];
        totalLightContrib += calculateLightContrib(light, in.pos, in.nor);
    }

    var finalColor = diffuseColor.rgb * totalLightContrib;

    // finalColor = generateClusterColor(clusterIndex);
    // finalColor = generateClusterNumColor(currentCluster.numLights);

    return vec4(finalColor, 1);
}

fn calculateZIndexFromDepth(depth: f32) -> u32 {
    let logZRatio = log2(cameraData.zFar / cameraData.zNear);
    let clusterDepthSize = logZRatio / f32(clusterGrid.clusterGridSizeZ);
    return u32(log2(depth / cameraData.zNear) / clusterDepthSize);
}

fn calculateClusterIndex(fragPixelPos: vec4f, fragPosWorld: vec3f) -> u32 {
    let clusterX = u32(fragPixelPos.x / f32(clusterGrid.canvasWidth) * f32(clusterGrid.clusterGridSizeX));
    let clusterY = u32(fragPixelPos.y / f32(clusterGrid.canvasHeight) * f32(clusterGrid.clusterGridSizeY));

    let fragPosView: vec4f = cameraData.viewMat * vec4(fragPosWorld, 1);
    let clusterZ = calculateZIndexFromDepth(abs(fragPosView.z));

    return clusterX + clusterY * clusterGrid.clusterGridSizeX + clusterZ * clusterGrid.clusterGridSizeX * clusterGrid.clusterGridSizeY;
}

fn hueToRgbComponent(n: f32, hue: f32) -> f32 {
    return 1.0 - abs(fract(n + hue * 6.0) * 2.0 - 1.0);
}

fn generateClusterGrayscale(clusterIndex: u32) -> vec3<f32> {
    let hue = f32(clusterIndex % 360u) / 360.0;

    return vec3<f32>(
        hueToRgbComponent(5.0, hue),
        hueToRgbComponent(3.0, hue),
        hueToRgbComponent(1.0, hue)
    );
}

fn generateClusterColor(clusterIndex: u32) -> vec3<f32> {
    let hueStep = 5u;
    let hue = f32((clusterIndex * hueStep) % 360u) / 360.0;

    let c = 1.0;
    let x = c * (1.0 - abs(fract(hue * 6.0) * 2.0 - 1.0));
    let m = 0.0;

    var r: f32;
    var g: f32;
    var b: f32;

    if (0.0 <= hue && hue < 1.0 / 6.0) {
        r = c; g = x; b = m;
    } else if (1.0 / 6.0 <= hue && hue < 2.0 / 6.0) {
        r = x; g = c; b = m;
    } else if (2.0 / 6.0 <= hue && hue < 3.0 / 6.0) {
        r = m; g = c; b = x;
    } else if (3.0 / 6.0 <= hue && hue < 4.0 / 6.0) {
        r = m; g = x; b = c;
    } else if (4.0 / 6.0 <= hue && hue < 5.0 / 6.0) {
        r = x; g = m; b = c;
    } else {
        r = c; g = m; b = x;
    }

    return vec3<f32>(r, g, b);
}

fn generateClusterNumColor(numLights: u32) -> vec3<f32> {
    let lightFactor = clamp(f32(numLights) / 256.0, 0.0, 1.0);
    return vec3<f32>(lightFactor, lightFactor, lightFactor);
}
