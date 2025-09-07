<template>
    <div class="flex justify-center items-center bg-gray-900 w-screen h-32 ">
        <div class="flex items-center bg-gray-700 w-screen h-16 rounded-md">
            <MenuDesplegable label="Menu" imagen="menu">
                <MenuItem to="/" name="Home" label="Home" imagen="home" :hasimagen="true"></MenuItem>
                <MenuItem to="/pruebas" name="Pruebas" label="Pruebas" imagen="pruebas"></MenuItem>
                <MenuDesplegable label="Menu" imagen="menu" :position="1" css="ml-9" >
                    <MenuDesplegable label="Menu" imagen="menu" :position="3" css="ml-9" >
                        <MenuItem to="/" name="Home" label="Home" imagen="home" :hasimagen="true"></MenuItem>
                        <MenuItem to="/pruebas" name="Pruebas" label="Pruebas" imagen="pruebas" :hasimagen="true"></MenuItem>
                    </MenuDesplegable>
                    <MenuDesplegable label="Menu" imagen="menu" :position="1" :hasimagen="true" ></MenuDesplegable>
                    <MenuItem to="/" name="Home" label="Home" imagen="home" :hasimagen="true"></MenuItem>
                    <MenuItem to="/pruebas" name="Pruebas" label="Pruebas" imagen="pruebas" :hasimagen="true"></MenuItem>
                </MenuDesplegable>
            </MenuDesplegable>
            <MenuDesplegable label="hola" imagen="menu">
                <MenuItem to="/" name="Home" label="Home" imagen="home" :hasimagen="true"></MenuItem>
                <MenuItem to="/pruebas" name="Pruebas" label="Pruebas" imagen="pruebas" :hasimagen="true"></MenuItem>
            </MenuDesplegable>
        </div>
    </div>
</template>

<script setup lang="ts">
import MenuDesplegable from "@/components/Menu/MenuDesplegable.vue";
import MenuItem from "@/components/Menu/MenuItem.vue";
</script>