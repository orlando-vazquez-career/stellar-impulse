<?xml version="1.0" encoding="UTF-8"?>
<tileset version="1.10" tiledversion="1.12.2" name="robot-sal" tilewidth="72" tileheight="80" tilecount="8" columns="8" objectalignment="bottom">
 <image source="sprites/robot-sal.png" width="576" height="80"/>
 <tile id="0">
  <properties>
   <property name="animacion" value="ciclo"/>
  </properties>
  <animation>
   <frame tileid="0" duration="1500"/>
   <frame tileid="1" duration="110"/>
   <frame tileid="2" duration="110"/>
   <frame tileid="3" duration="110"/>
   <frame tileid="4" duration="110"/>
   <frame tileid="5" duration="110"/>
   <frame tileid="6" duration="110"/>
   <frame tileid="7" duration="2000"/>
   <frame tileid="6" duration="110"/>
   <frame tileid="5" duration="110"/>
   <frame tileid="4" duration="110"/>
   <frame tileid="3" duration="110"/>
   <frame tileid="2" duration="110"/>
   <frame tileid="1" duration="110"/>
  </animation>
 </tile>
 <tile id="1">
  <properties>
   <property name="animacion" value="salir"/>
  </properties>
  <animation>
   <frame tileid="0" duration="110"/>
   <frame tileid="1" duration="110"/>
   <frame tileid="2" duration="110"/>
   <frame tileid="3" duration="110"/>
   <frame tileid="4" duration="110"/>
   <frame tileid="5" duration="110"/>
   <frame tileid="6" duration="110"/>
   <frame tileid="7" duration="1500"/>
  </animation>
 </tile>
 <tile id="7">
  <properties>
   <property name="animacion" value="volver"/>
  </properties>
  <animation>
   <frame tileid="7" duration="110"/>
   <frame tileid="6" duration="110"/>
   <frame tileid="5" duration="110"/>
   <frame tileid="4" duration="110"/>
   <frame tileid="3" duration="110"/>
   <frame tileid="2" duration="110"/>
   <frame tileid="1" duration="110"/>
   <frame tileid="0" duration="1500"/>
  </animation>
 </tile>
</tileset>
