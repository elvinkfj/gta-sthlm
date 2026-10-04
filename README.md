# Gubbe på Vägen

Ett 3D-spel i webbläsaren där du är en gubbe i Stockholms innerstad. Du går runt, väljer bland tio bilar som finns i verkligheten och kör genom stan. Bilarna i trafiken kan du springa fram till och ta medan de kör. Polisen patrullerar, och krockar syns och märks på bilen.

## Spela

Öppna `index.html` i Chrome, Safari, Firefox eller Edge. Spelet är en enda fil och behöver ingen installation, men datorn måste vara uppkopplad eftersom 3D-motorn (Three.js) och typsnitten laddas från internet.

## Kontroller

| Tangent | Gör |
| --- | --- |
| W A S D eller piltangenterna | Gå, eller gasa, bromsa och styr |
| S | Bromsar. När bilen står still: släpp och håll in S igen så läggs R i och du backar |
| Mus | Titta runt (klicka i spelet först, Esc släpper musen) |
| Shift | Spring |
| Mellanslag | Hoppa, eller handbroms i bilen |
| M / N | Växla upp / ner. Under ettan ligger R, men bara när bilen står still |
| G | Byt mellan automat och manuell växellåda |
| E | Kliv in, ta en bil som kör förbi, kliv ur |
| B | Välj bilmodell |
| K | Stor karta över hela stan. Du kan också klicka på kartan i hörnet (tryck Esc först om musen är låst). Dra för att flytta, scrolla eller + och − för att zooma, Esc eller K stänger |
| F | Tuta |
| L | Blåljus och siren, när du kör en polisbil |
| R | Ställ bilen på gatan igen |
| T | Ljud av och på |
| H | Visa hjälp |

På mobil och surfplatta finns en styrspak och knappar på skärmen, och ▲ ▼ för att växla när du kör.

## Innehåll

- **Staden:** Stockholms innerstad byggd efter det riktiga gatunätet: Gamla stan, Riddarholmen, Helgeandsholmen, Norrmalm, Vasastan, Östermalm, Blasieholmen, Skeppsholmen, Kungsholmen, Djurgården och Södermalm, med Strömmen, Riddarfjärden, Nybroviken och Saltsjön emellan. Gatorna har sina riktiga namn och går där de går i verkligheten, och broarna (Norrbro, Riksbron, Strömbron, Skeppsholmsbron, Centralbron med flera) binder ihop öarna. Kända byggnader står på sina platser: Kungliga slottet, Storkyrkan, Tyska kyrkan, Börshuset, Riddarhuset, Riddarholmskyrkan, Riksdagshuset, Operan, Arvfurstens palats, Stadshuset med de tre kronorna, Centralstationen, NK med den snurrande skylten, Kulturhuset och glasobelisken på Sergels torg, Hötorgsskraporna, Konserthuset, Grand Hôtel, Nationalmuseum, af Chapman, Moderna museet, Vasamuseet, Katarina kyrka och Katarinahissen. Parker och torg som Kungsträdgården, Berzelii park, Humlegården, Stortorget, Mariatorget och Medborgarplatsen finns med, och tunnelbaneuppgångarna är utmärkta. Globen och Kaknästornet syns i horisonten.
- **Starten:** du börjar på parkeringen på kajen vid Skeppsbron i Gamla stan, i gången mellan två rader målade parkeringsrutor. Varje bilmodell står parkerad i rutorna närmast dig, bussen har en egen bussficka och fler bilar står utspridda i resten av rutorna. Gå fram till en bil och tryck E för att ta den.
- **Kartan:** minikartan i hörnet följer dig. Klickar du på den, eller trycker K, öppnas en stor karta över hela stan med gatunamn, byggnader, tunnelbana, polisbilar och din bil. Spelet står still medan kartan är öppen.
- **Bilarna:** modellerade efter riktiga bilar med rätt mått, hjulbas och form: VW Golf, Tesla Model 3, Volvo V60, en taxi (Toyota Prius med taxiskylt och gula nummerplåtar), Volvo XC90, Mercedes Sprinter och en röd eller blå SL-buss, plus tre sportbilar som är betydligt snabbare: Porsche 911, Lamborghini Huracán och Ford Mustang. Polisbilarna är Volvo V90 i svensk polismålning. Varje bil har sina egna lyktor, grill, fönster och fälgar, och man ser in i kupén genom rutorna. Sätena anpassar sig efter taket, så de får plats även i de låga sportbilarna.
- **Trafiken:** AI-bilar som kör i högertrafik, svänger i korsningarna, stannar för dig och kör om. Fotgängare går på trottoarerna och hoppar undan för bilar.
- **Polisen:** fyra polisbilar (vita med blågul markering) kör runt i trafiken. Hastighetsgränsen är 30 km/h i Gamla stan, 50 km/h på broarna och 40 km/h i resten av stan, och skylten bredvid hastighetsmätaren visar vad som gäller där du är. Kör du mer än 8 km/h för fort där en polis ser dig, krockar med en polisbil, tar en bil framför dem eller kör på någon, slår de på blåljus och siren. Trafiken drar sig då åt sidan. Polisen följer gatorna dit de såg dig senast och kör rakt mot dig när de har dig i sikte. Stanna bredvid en polisbil så får du böter efter hur mycket för fort du körde. Kommer du utom synhåll och de inte hittar dig ger de upp. Ibland får en polisbil ett larm och åker på utryckning till en annan del av stan. Med blåljus på, både på utryckning och under en jakt, kör polisen som i verkligheten: fortare än hastighetsgränsen, mitt i gatan och direkt om bilar som är i vägen, och trafiken både bakom och framifrån drar sig åt sidan. Polisbilar kan du också ta, och med L sätter du på blåljuset själv.
- **Växellådan:** varje bil har egna växlar och ett eget varvtal, från bussens fyra växlar till superbilens sju. Teslan har en elmotor med en enda växel och drar fullt redan från stillastående. Automatlådan växlar själv, och S bromsar bara tills bilen står still innan den kan läggas i R. Trycker du M eller N blir lådan manuell: i för låg växel slår motorn i varvbegränsaren, i för hög växel orkar den knappt dra. Varvräknaren sitter under hastighetsmätaren.
- **Skador:** bilen bucklas in där den träffas. Ju hårdare krock, desto större buckla. Lacken skrapas, lyktor går sönder, rutorna spricker och hjulen kan bli sneda så att bilen drar åt ena hållet. Krockar mot motorn kostar mest: först ångar den, sedan ryker den och orkar mindre, och till slut lägger den av. Väljer du en ny bil med B får du en hel bil.
- **Ljudet:** motorljuden skapas i spelet efter motortyp. Teslan är en elbil som bara viner, rak fyra i Golfen och taxin, femcylindrig i V60:n, turbofyra i polisbilen, diesel i XC90:n och Sprintern, V8 i Mustangen, boxersexa i Porschen, V10 i Lamborghinin och en stor diesel i bussen, med tryckluftsbroms. Bilarna runt omkring hörs också, liksom däckskrik, krockar, krossat glas och sirener.
- **Grafiken:** himmel med moln och sol, ljus och skuggor beräknade på ett fysikaliskt sätt, reflektioner i bilarnas lack och i fönster och vatten, varierade fönster, sladdmärken och rök. Spelet sänker upplösningen av sig självt om datorn inte hinner med.

Staden är en förenklad kopia: gatorna, broarna, vattnet och de kända byggnaderna ligger där de ligger i verkligheten, men kvarteren mellan gatorna är förenklade.
