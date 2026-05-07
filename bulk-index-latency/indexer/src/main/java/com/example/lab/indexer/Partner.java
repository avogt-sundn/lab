package com.example.lab.indexer;

import io.quarkus.hibernate.orm.panache.PanacheEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;

@Entity
@Table(name = "partner")
public class Partner extends PanacheEntity {

    @Column(name = "partner_number")
    public long partnerNumber;

    @Column(name = "alpha_code")
    public String alphaCode;

    public String name1;
    public String name2;
    public String name3;
    public String firstname;
    public String street;

    @Column(name = "house_number")
    public String houseNumber;

    @Column(name = "postal_code")
    public String postalCode;

    public String city;
    public String type;

    @Column(name = "group_type")
    public String groupType;

    @Column(name = "group_number")
    public Long groupNumber;
}
