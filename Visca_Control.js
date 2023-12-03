function init() {
  script.log("Cisco PrecicionHD Camera Control module init");
  updatePresetStorage();
}


function moduleParameterChanged(param) {
  if(param.name == "numberOfPresets"){
    updatePresetStorage();
  }
  if(param.name == "loadPreset"){
    parent = param.getParent();
    number = parent.name.replace("preset","");
    loadPreset(number);
  }
  if(param.name == "savePreset"){
    parent = param.getParent();
    number = parent.name.replace("preset","");
    savePreset(number);
  }
  //script.log(param.name + " parameter changed, new value: " + param.get());
}

function moduleValueChanged(value) {
  script.log(value.name + " value changed, new value: " + value.get());
}

function convert2Byte(value){
  bytes = [];
  bytes[0] = (value>>12)&0x0f;
  bytes[1] = (value>>8)&0x0f;
  bytes[2] = (value>>4)&0x0f;
  bytes[3] = value&0x0f;
  return bytes;
}

function getContainerChildren(container) {
  var r = [];

  var content = util.getObjectProperties(container);

  for (var i = 0; i< content.length; i++) {
      if (container[content[i]]._type == "Container") {
          r.push(container[content[i]]);
      }
  }

  return r;
}

function updatePresetStorage(){
  numPresets = local.parameters.numberOfPresets.get();
  presetContainer = local.parameters.presets;
  children = getContainerChildren(presetContainer);
  if (children.length < numPresets){
    //the number of current existing presets is smaller than the set number of presets -> we need to add more storage slots
    for (i = 1; i<=numPresets; i++){
      presetName = "Preset "+i;
      preset = presetContainer.addContainer(presetName);
      preset.addTrigger("load Preset", "this will load this preset");
      preset.addTrigger("save Preset", "this will save the current values for Pan, Tilt, Zoom and Focus to this preset");
      preset.addIntParameter("Pan Position", "Pan Position", 400, 0, 800);
      preset.addIntParameter("Tilt Position", "Tilt Position", 106, 0, 212);
      preset.addIntParameter("Zoom Position", "Zoom Position", 1500, 0, 2885);
      preset.addIntParameter("Focus Position", "Focus Position", 4096, 4096, 4672);
    }
  }else if (children.length > numPresets){
    //the number of existing presets is bigger than the amount defined in the module settings -> we need to remove the additional preset slots
    for(i = numPresets+1; i<=children.length;i++){
      presetName = "Preset "+i;
      presetContainer.removeContainer(presetName);
    }
  }

}

function savePreset(num){
  script.log("preset "+num+" saved");
  presetContainer = local.parameters.presets.getChild("Preset"+num);
  presetContainer.panPosition.set(local.parameters.position.panPosition.get());
  presetContainer.tiltPosition.set(local.parameters.position.tiltPosition.get());
  presetContainer.zoomPosition.set(local.parameters.position.zoomPosition.get());
  presetContainer.focusPosition.set(local.parameters.position.focusPosition.get());

}

function loadPreset(num){
  script.log("loading preset "+num);
  presetContainer = local.parameters.presets.getChild("Preset"+num);
  local.parameters.position.panPosition.set(presetContainer.panPosition.get());
  local.parameters.position.tiltPosition.set(presetContainer.tiltPosition.get());
  local.parameters.position.zoomPosition.set(presetContainer.zoomPosition.get());
  local.parameters.position.focusPosition.set(presetContainer.focusPosition.get());

  setPTZF();
}


//from https://github.com/JvPeek/esp8266-mqtt-visca/blob/main/src/commands.cpp
//void convertValues(uint input, byte* output) {
//  output[0] = (input >> 12) & 0x0f; //shift by 12 bits and take the last 4 bit
//  output[1] = (input >> 8) & 0x0f; //shift initial value by 8 bits and take the new last 4 bits
//  output[2] = (input >> 4) & 0x0f; //shift initial value by 4 bits and take the last 4 bits
//  output[3] = input & 0x0f; //take the last 4 bits
//}


//from https://github.com/JvPeek/esp8266-mqtt-visca/blob/main/src/commands.cpp#L130C19-L140C49
//Serial Command to set Position after the convertValues function was called for xyzf
//(0x81 + cam),   0x01,
//0x06,           0x20,
//(x >> 12) & 0x0f, (x >> 8) & 0x0f,
//(x >> 4) & 0x0f, x & 0x0f,
//(y >> 12) & 0x0f, (y >> 8) & 0x0f,
//(y >> 4) & 0x0f, y & 0x0f,
//(z >> 12) & 0x0f, (z >> 8) & 0x0f,
//(z >> 4) & 0x0f, z & 0x0f,
//(f >> 12) & 0x0f, (f >> 8) & 0x0f,
//(f >> 4) & 0x0f, f & 0x0f


//Ranges for Pan, Tilt, Zoom and Focus according to https://github.com/JvPeek/esp8266-mqtt-visca/blob/main/src/camera.h
//#define MAXX 800
//#define MAXY 212
////Range 0-2885
//#define MAXZ 2885
////Range 4096-4672
//#define MAXF 5000

lastRequest = null;
receiveBuffer = [];
function dataReceived(data) {
  script.log("Data received:");
  script.log(data);
  for (i = 0; i<data.length;i++){
    receiveBuffer.push(data[i]);
  }
  script.log(" -#- last Byte: "+data[data.length -1]);
  if (data[data.length -1]==255){
    //message end we can parse the message in the Buffer:
    script.log("MessageBuffer: ");
    script.log(receiveBuffer);
    //for (i=0; i < receiveBuffer.length; i++){
    //  script.log(receiveBuffer[i]);
    //}
    if (receiveBuffer[0] == 0x90 && receiveBuffer[1] == 0x50 && receiveBuffer.length==11 && lastRequest == "position"){
      script.log("Position Info received!");
      ////Pan Position:
      //receiveBuffer[2];  1111000000000000
      //receiveBuffer[3];  0000111100000000
      //receiveBuffer[4];  0000000011110000
      //receiveBuffer[5];  0000000000001111
      ////Tilt Position:
      //receiveBuffer[6];
      //receiveBuffer[7];
      //receiveBuffer[8];
      //receiveBuffer[9];
      pansum = 0;
      pansum += (receiveBuffer[2]&0x0f)<<12; 
      pansum += (receiveBuffer[3]&0x0f)<<8;
      pansum += (receiveBuffer[4]&0x0f)<<4;
      pansum += (receiveBuffer[5]&0x0f);
      local.parameters.position.panPosition.set(pansum);
      tiltsum = 0;
      tiltsum += (receiveBuffer[6]&0x0f)<<12; 
      tiltsum += (receiveBuffer[7]&0x0f)<<8;
      tiltsum += (receiveBuffer[8]&0x0f)<<4;
      tiltsum += (receiveBuffer[9]&0x0f);
      local.parameters.position.tiltPosition.set(tiltsum);
    }else if(receiveBuffer[0] == 0x90 && receiveBuffer[1] == 0x50 && receiveBuffer.length==7 && lastRequest == "zoom"){
      script.log("Zoom Info received!");
      zoomsum = 0;
      zoomsum += (receiveBuffer[2]&0x0f)<<12; 
      zoomsum += (receiveBuffer[3]&0x0f)<<8;
      zoomsum += (receiveBuffer[4]&0x0f)<<4;
      zoomsum += (receiveBuffer[5]&0x0f);
      local.parameters.position.zoomPosition.set(zoomsum);
    }else if(receiveBuffer[0] == 0x90 && receiveBuffer[1] == 0x50 && receiveBuffer.length==7 && lastRequest == "focus"){
      script.log("Focus Info received!");
      focussum = 0;
      focussum += (receiveBuffer[2]&0x0f)<<12; 
      focussum += (receiveBuffer[3]&0x0f)<<8;
      focussum += (receiveBuffer[4]&0x0f)<<4;
      focussum += (receiveBuffer[5]&0x0f);
      local.parameters.position.focusPosition.set(focussum);
    }else if(receiveBuffer[0] == 0x90 && receiveBuffer[1] == 0x50 && receiveBuffer.length==4 && lastRequest == "focusMode"){
      script.log("Focus Mode received!");
      script.log(receiveBuffer[2]);
      if(receiveBuffer[2]==3){
        local.parameters.focusMode.set("manual");
      }else{
        local.parameters.focusMode.set("auto");
      }
    }
    receiveBuffer = [];
  }
  }

function reboot() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Reboot");
  local.parameters.baudRate.set(9600);
  local.sendBytes(0x80+camID, 0x1, 0x42, 0xff);
}

function setSerialSpeed(speed) {
  camID = local.parameters.camIndex.get();
  if(speed=115200){
    script.log("Cam number " + camID + " setting to 115200 Baud");
    local.sendBytes(0x80+camID, 0x1, 0x34, 0x1, 0xff);
    //local.parameters.baudRate.set(115200);
  }else{
    script.log("Cam number " + camID + " setting to 9600 Baud");
    local.sendBytes(0x80+camID, 0x1, 0x34, 0x0, 0xff);
    local.parameters.baudRate.set(9600);
  }
}

function flip(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " Flip ON");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x66, 0x2, 0xff);
  }
  else{
    script.log("Cam number " + camID + " Flip OFF");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x66, 0x3, 0xff);
  }
}

function mirror(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " Mirror ON");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x61, 0x2, 0xff);
  }
  else{
    script.log("Cam number " + camID + " Mirror OFF");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x61, 0x3, 0xff);
  }
}

function backlight(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " BacklightCompensation ON");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x33, 0x2, 0xff);
  }
  else{
    script.log("Cam number " + camID + " BacklightCompensation OFF");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x33, 0x3, 0xff);
  }
}

function mmDetect(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " Motor Movement Detection ON");
    local.sendBytes(0x80+camID, 0x1, 0x50, 0x30, 0x1, 0xff);
  }
  else{
    script.log("Cam number " + camID + " Motor Movement Detection OFF");
    local.sendBytes(0x80+camID, 0x1, 0x50, 0x30, 0x0, 0xff);
  }
}

function powerLED(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " PowerLED ON");
    local.sendBytes(0x80+camID, 0x1, 0x33, 0x2, 0x1, 0xff);
  }
  else{
    script.log("Cam number " + camID + " PowerLED OFF");
    local.sendBytes(0x80+camID, 0x1, 0x33, 0x2, 0x0, 0xff);
  }
}

function callLED(state) {
  camID = local.parameters.camIndex.get();
  if (state == "on"){
    script.log("Cam number " + camID + " callLED ON");
    local.sendBytes(0x80+camID, 0x1, 0x33, 0x1, 0x1, 0xff);
  }
  else if(state == "off"){
    script.log("Cam number " + camID + " callLED OFF");
    local.sendBytes(0x80+camID, 0x1, 0x33, 0x1, 0x0, 0xff);
  }
  else if(state == "blink"){
    script.log("Cam number " + camID + " callLED BLINK");
    local.sendBytes(0x80+camID, 0x1, 0x33, 0x1, 0x2, 0xff);
  }
}

function irOutput(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " IR Output ON");
    local.sendBytes(0x80+camID, 0x1, 0x6, 0x8, 0x2, 0xff);
  }
  else{
    script.log("Cam number " + camID + " IR Output OFF");
    local.sendBytes(0x80+camID, 0x1, 0x6, 0x8, 0x3, 0xff);
  }
}

function irControl(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " IR Control ON");
    local.sendBytes(0x80+camID, 0x1, 0x6, 0x9, 0x2, 0xff);
  }
  else{
    script.log("Cam number " + camID + " IR Control OFF");
    local.sendBytes(0x80+camID, 0x1, 0x6, 0x9, 0x3, 0xff);
  }
}

function ptStop() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Stop");
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x3, 0x3, 0x3, 0x3, 0xff);
}

function ptReset() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Reset");
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x5, 0xff);
}

function ptUp() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Up");
  ps = 0; //pan Speed
  ts = local.parameters.speed.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x3, 0x1, 0xff);
}

function ptDown() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Down");
  ps = 0; //pan Speed
  ts = local.parameters.speed.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x3, 0x2, 0xff);
}

function ptLeft() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Left");
  ps = local.parameters.speed.panSpeed.get();
  ts = 0; //local.values.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x1, 0x3, 0xff);
}

function ptRight() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Right");
  ps = local.parameters.speed.panSpeed.get();
  ts = 0; //local.values.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x2, 0x3, 0xff);
}

function ptUpLeft() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Up Left");
  ps = local.parameters.speed.panSpeed.get();
  ts = local.parameters.speed.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x1, 0x1, 0xff);
}

function ptUpRight() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Up Right");
  ps = local.parameters.speed.panSpeed.get();
  ts = local.parameters.speed.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x2, 0x1, 0xff);
}

function ptDownLeft() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Down Left");
  ps = local.parameters.speed.panSpeed.get();
  ts = local.parameters.speed.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x1, 0x2, 0xff);
}

function ptDownRight() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " PT Down Right");
  ps = local.parameters.speed.panSpeed.get();
  ts = local.parameters.speed.tiltSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x1, 0x0+ps, 0x0+ts, 0x2, 0x2, 0xff);
}

function zoomStop() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Zoom Stop");
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x7, 0x0, 0xff);
}

function zoomTele() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Zoom Tele");
  zs = local.parameters.speed.zoomSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x7, 0x20+zs, 0xff);
}

function zoomWide() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Zoom Wide");
  zs = local.parameters.speed.zoomSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x7, 0x30+zs, 0xff);
}

function focusStop() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Focus Stop");
  fs = local.parameters.speed.focusSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x8, 0x0, 0xff);
}

function focusFar() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Focus Far");
  fs = local.parameters.speed.focusSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x8, 0x20+fs, 0xff);
}

function focusNear() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Focus Near");
  fs = local.parameters.speed.focusSpeed.get();
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x8, 0x30+fs, 0xff);
}

function focusAuto(state) {
  camID = local.parameters.camIndex.get();
  if (state){
    script.log("Cam number " + camID + " Autofocus Enabled");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x38, 0x2, 0xff);
  }else{
    script.log("Cam number " + camID + " Autofocus Disabled");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x38, 0x3, 0xff);
  }
}

function reqPos() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Requesting Position");
  local.sendBytes(0x80+camID, 0x9, 0x6, 0x12, 0xff);
  lastRequest = "position";
}

function reqZoom() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Requesting Zoom");
  local.sendBytes(0x80+camID, 0x9, 0x4, 0x47, 0xff);
  lastRequest = "zoom";
}

function reqFocus() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Requesting Focus");
  local.sendBytes(0x80+camID, 0x9, 0x4, 0x48, 0xff);
  lastRequest = "focus";
}

function reqFocusMode() {
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Requesting Focus-Mode");
  local.sendBytes(0x80+camID, 0x9, 0x4, 0x38, 0xff);
  lastRequest = "focusMode";
}

function setPTZF(){
  //(0x81 + cam),   0x01,
  //0x06,           0x20,
  //(x >> 12) & 0x0f,     (x >> 8) & 0x0f,
  //(x >> 4) & 0x0f,     x & 0x0f,
  //(y >> 12) & 0x0f,     (y >> 8) & 0x0f,
  //(y >> 4) & 0x0f,     y & 0x0f,
  //(z >> 12) & 0x0f,     (z >> 8) & 0x0f,
  //(z >> 4) & 0x0f,     z & 0x0f,
  //(f >> 12) & 0x0f,     (f >> 8) & 0x0f,
  //(f >> 4) & 0x0f,     f & 0x0f
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Setting PTZF values");
  panBytes =    convert2Byte(local.parameters.position.panPosition.get());
  tiltBytes =   convert2Byte(local.parameters.position.tiltPosition.get());
  zoomBytes =   convert2Byte(local.parameters.position.zoomPosition.get());
  focusBytes =  convert2Byte(local.parameters.position.focusPosition.get());
  local.sendBytes(0x80+camID, 0x01, 0x06, 0x20, 
                  panBytes[0], panBytes[1], panBytes[2], panBytes[3], 
                  tiltBytes[0], tiltBytes[1], tiltBytes[2], tiltBytes[3], 
                  zoomBytes[0], zoomBytes[1], zoomBytes[2], zoomBytes[3], 
                  focusBytes[0], focusBytes[1], focusBytes[2], focusBytes[3], 
                  0xff);
}

function setPT(){
  camID = local.parameters.camIndex.get();
  script.log("Cam number " + camID + " Setting PT Values");
  ps = local.parameters.speed.panSpeed.get();
  ts = local.parameters.speed.tiltSpeed.get();
  panBytes =  convert2Byte(local.parameters.position.panPosition.get());
  tiltBytes = convert2Byte(local.parameters.position.tiltPosition.get());
  local.sendBytes(0x80+camID, 0x1, 0x6, 0x2, 0x0+ps, 0x0+ts, 
                  panBytes[0], panBytes[1], panBytes[2], panBytes[3], 
                  tiltBytes[0], tiltBytes[1], tiltBytes[2], tiltBytes[3], 
                  0xff);
}

function gammaMode(mode){
  camID = local.parameters.camIndex.get();
  if(mode=="manual"){
    script.log("Cam number " + camID + " Setting Gamma-Mode to manual");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x51, 0x03, 0xff);
  }else{
    script.log("Cam number " + camID + " Setting Gamma-Mode to auto");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x51, 0x02, 0xff);
  }
}

function gammaTable(index, slot){
  camID = local.parameters.camIndex.get();
  //if(slot=="0"){
  //  script.log("Cam number " + camID + " Setting Gamma-Table Slot "+ slot +" to "+index);
  //  local.sendBytes(0x80+camID, 0x1, 0x4, 0x52, 0x0+index, 0x4, 0x4, 0x4, 0xff);
  //}else if(slot=="1"){
  //  script.log("Cam number " + camID + " Setting Gamma-Table Slot "+ slot +" to "+index);
  //  local.sendBytes(0x80+camID, 0x1, 0x4, 0x52, 0x4, 0x0+index, 0x4, 0x4, 0xff);
  //}else if(slot=="2"){
  //  script.log("Cam number " + camID + " Setting Gamma-Table Slot "+ slot +" to "+index);
  //  local.sendBytes(0x80+camID, 0x1, 0x4, 0x52, 0x4, 0x4, 0x0+index, 0x4, 0xff);
  //}else if(slot=="3"){
  //  script.log("Cam number " + camID + " Setting Gamma-Table Slot "+ slot +" to "+index);
  //  local.sendBytes(0x80+camID, 0x1, 0x4, 0x52, 0x4, 0x4, 0x4, 0x0+index, 0xff);
  //}
  script.log("Cam number " + camID + " Setting Gamma-Table to "+index);
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x52, 0x0+index, 0x0+index, 0x0+index, 0x0+index, 0xff);
}

function wbMode(mode){
  camID = local.parameters.camIndex.get();
  if(mode=="manual"){
    script.log("Cam number " + camID + " Setting White Balance to manual");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x35, 0x06, 0xff);
  }else{
    script.log("Cam number " + camID + " Setting White Balance to auto");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x35, 0x0, 0xff);
  }
}

function wbSetting(p,q,r,s){
  camID = local.parameters.camIndex.get();
  // s - most effect 0=daylight to 15=tungsten
  // p - least effect
  script.log("Cam number " + camID + " Setting White Balance to pqrs: "+p+", "+q+", "+r+", "+s);
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x75, p, q, r, s, 0xff);
}

function exposureMode(mode){
  camID = local.parameters.camIndex.get();
  if(mode=="manual"){
    script.log("Cam number " + camID + " Setting Exposure Mode to manual");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x39, 0x03, 0xff);
  }else{
    script.log("Cam number " + camID + " Setting Exposure Mode to auto");
    local.sendBytes(0x80+camID, 0x1, 0x4, 0x39, 0x0, 0xff);
  }
}

function exposureSetting(shutter){
  camID = local.parameters.camIndex.get();
  // s - smallest changes
  // r - rollover from s - value range from 0-50 (maybe 49), shutter effectivly opens at value 4
  // q - no effect
  // p - needs to be at an odd value (1,3,5,...), on even numbers shutter is fully closed (probably only the last bit is importand)
  p = 1;
  q = 0;
  s = shutter % 16;
  r = parseInt((shutter - s)/16);
  script.log("Cam number " + camID + " Setting Exposure to pqrs: "+p+", "+q+", "+r+", "+s);
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x4b, p, q, r, s, 0xff);
}

function gainSetting(p,q,r,s){
  camID = local.parameters.camIndex.get();
  // s - most effect 0=daylight to 15=tungsten
  // p - least effect
  script.log("Cam number " + camID + " Setting gain to pqrs: "+p+", "+q+", "+r+", "+s);
  local.sendBytes(0x80+camID, 0x1, 0x4, 0x4c, p, q, r, s, 0xff);
}