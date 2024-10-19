// File: shaders/packed_clustered_deferred.fs.wgsl

@group(${bindGroup_scene}) @binding(0) var<uniform> cameraUniforms: CameraUniforms;

@group(${bindGroup_material}) @binding(0) var diffuseTex: texture_2d<f32>;
@group(${bindGroup_material}) @binding(1) var diffuseTexSampler: sampler;

struct FragmentInput {
    @builtin(position) fragPos: vec4f,
    @location(0) pos: vec3f,
    @location(1) nor: vec3f,
    @location(2) uv: vec2f,
};

struct FragmentOutput {
    @location(0) data: vec4u,
};

// Octahedral normal encoding
fn octEncode(n_in: vec3f) -> vec2f {
    let n_normalized = normalize(n_in);
    let l1Norm = abs(n_normalized.x) + abs(n_normalized.y) + abs(n_normalized.z);
    var oct = n_normalized.xy / l1Norm;
    if (n_normalized.z < 0.0) {
        oct = (1.0 - abs(oct.yx)) * sign(oct);
    }
    return oct * 0.5 + 0.5; // Map to [0,1]
}

@fragment
fn main(in: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;

    let color = textureSample(diffuseTex, diffuseTexSampler, in.uv);
    if (color.a < 0.5) {
        discard;
    }

    // **Encode Diffuse Color**
    let packedColor: u32 = pack4x8unorm(color);

    // **Encode Normal**
    let encodedNormal = octEncode(in.nor);
    let packedNormal: u32 = pack2x16unorm(encodedNormal);

    // **Encode Depth**
    let ndcPos = in.fragPos / in.fragPos.w;
    let depthNDC = ndcPos.z; // NDC depth in [-1, 1]
    let depth01 = depthNDC * 0.5 + 0.5; // Map to [0, 1]
    let depth32u: u32 = u32(depth01 * 4294967295.0); // Quantize depth to 32 bits

    let depth : u32 = bitcast<u32>(in.fragPos.z);

    // **Pack Data into vec4u**
    output.data = vec4u(packedColor, packedNormal, depth, 0u);

    return output;
}
