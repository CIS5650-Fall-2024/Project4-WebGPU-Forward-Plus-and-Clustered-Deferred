// File: shaders/packed_clustered_deferred_fullscreen.fs.wgsl

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;
@group(${bindGroup_scene}) @binding(1) var<storage, read> lightSet: LightSet;
@group(${bindGroup_scene}) @binding(2) var<storage, read> clusterLights: array<u32>;

@group(1) @binding(0) var packedDataTex: texture_2d<u32>;

const maxLightsPerCluster = ${maxLightsPerCluster};

// Octahedral normal decoding
fn octDecode(oct: vec2f) -> vec3f {
    let f = oct * 2.0 - 1.0; // Map from [0,1] to [-1,1]
    var n = vec3f(f.x, f.y, 1.0 - abs(f.x) - abs(f.y));
    let t = clamp(-n.z, 0.0, 1.0);
    n.x += select(t, -t, n.x >= 0.0);
    n.y += select(t, -t, n.y >= 0.0);
    return normalize(n);
}

@fragment
fn main(@builtin(position) fragCoord: vec4f) -> @location(0) vec4f {
    
    let screenWidth = cameraUniforms.screenWidth;
    let screenHeight = cameraUniforms.screenHeight;
    let uv01 = vec2f(fragCoord.x / screenWidth, fragCoord.y / screenHeight);
    let uvScreen = vec2i(i32(fragCoord.x), i32(fragCoord.y));



    let data = textureLoad(packedDataTex, uvScreen, 0);
    // **Unpack Diffuse Color**
    let albedo = unpack4x8unorm(data.x).rgb;
    // **Unpack and Decode Normal**
    let encodedNormal = unpack2x16unorm(data.y);
    let normal = octDecode(encodedNormal);
    // **Unpack Depth**
    let depth01 = f32(data.z) / 4294967295.0; // Map back to [0,1]
    let depthNDC = depth01 * 2.0 - 1.0;       // Map to NDC depth [-1,1]
    // **Reconstruct NDC Position**
    let ndcPos = vec3f(
        (fragCoord.x / cameraUniforms.screenWidth) * 2.0 - 1.0,
        (fragCoord.y / cameraUniforms.screenHeight) * 2.0 - 1.0,
        depthNDC
    );

    // **Reconstruct View-Space Position**
    let clipPos = vec4f(ndcPos, 1.0);
    let viewPosH = cameraUniforms.invProjMat * clipPos;
    let viewPos = viewPosH.xyz / viewPosH.w;


     //vec2 ndcPos = fragCoord
    let xCluster = u32(uv01.x * f32(${clusterCountX}));
    let yCluster = u32((1.0 - uv01.y)  * f32(${clusterCountY}));

    // Calculate cluster indices using logarithmic depth
    //var viewPos =  cameraUniforms.viewMat * vec4f(pos, 1.0);
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
        totalLightContrib += //calculateLightContrib(light, vec3(depthClamped), nor, cameraUniforms.viewMat);
    }

    var finalColor = albedo * totalLightContrib;
    return vec4(finalColor, 1.0);
    //return vec4(f32(xCluster)/10.0,f32(yCluster)/10.0,0.0, 1.0);
}

fn view_calculateLightContrib(light: Light, posView: vec3f, nor: vec3f, mat4x4 view) -> vec3f {
    let vecToLight = view * light.pos - posView;
    let distToLight = length(vecToLight);

    let lambert = max(dot(nor, normalize(vecToLight)), 0.f);
    return light.color * lambert * rangeAttenuation(distToLight);
}
